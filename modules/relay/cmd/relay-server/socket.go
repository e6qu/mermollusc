package main

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"

	"github.com/e6qu/mermollusc/modules/relay/relay"
)

// wsSocket adapts a real coder/websocket connection to relay.Socket. Concurrent writes are safe per
// coder/websocket's own contract, so Send needs no additional locking here. OnMessage/OnClose registration
// (from the goroutine running Core.Connect) and readLoop's dispatch (from its own goroutine, started
// concurrently — see server.go) race on the listener fields without explicit synchronization, so those are
// guarded by mu; readLoop additionally waits on `ready` so it never dispatches to a nil listener and
// silently drops a frame that arrived before Core.Connect finished registering (both are set exactly
// once, synchronously, as Connect's first two actions).
type wsSocket struct {
	conn *websocket.Conn
	open atomic.Bool

	mu         sync.Mutex
	onMessage  func(data []byte)
	onClose    func()
	registered int
	ready      chan struct{}

	log relay.Logger
}

func newWSSocket(conn *websocket.Conn, log relay.Logger) *wsSocket {
	s := &wsSocket{conn: conn, log: log, ready: make(chan struct{})}
	s.open.Store(true)
	return s
}

// listenerRegistered marks one of the two listeners as set, closing `ready` once both are — call with mu
// held.
func (s *wsSocket) listenerRegistered() {
	s.registered++
	if s.registered == 2 {
		close(s.ready)
	}
}

func (s *wsSocket) Send(data []byte) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := s.conn.Write(ctx, websocket.MessageBinary, data); err != nil {
		s.log.Printf("relay: socket write failed — %v", err)
	}
}

func (s *wsSocket) Close(code int, reason string) {
	if !s.open.CompareAndSwap(true, false) {
		return
	}
	_ = s.conn.Close(websocket.StatusCode(code), reason)
}

func (s *wsSocket) IsOpen() bool { return s.open.Load() }

func (s *wsSocket) OnMessage(listener func(data []byte)) {
	s.mu.Lock()
	s.onMessage = listener
	s.listenerRegistered()
	s.mu.Unlock()
}

func (s *wsSocket) OnClose(listener func()) {
	s.mu.Lock()
	s.onClose = listener
	s.listenerRegistered()
	s.mu.Unlock()
}

// readLoop blocks reading frames until the connection closes or errors, dispatching to the registered
// listeners. Must be started in its own goroutine — relay.Core.Connect blocks the calling goroutine until
// OnClose fires, so it cannot also drive reads. Waits for both listeners to be registered before reading
// anything, so no frame that arrives right after the handshake can race ahead of Core.Connect's setup.
func (s *wsSocket) readLoop(ctx context.Context) {
	<-s.ready
	defer func() {
		if s.open.CompareAndSwap(true, false) {
			_ = s.conn.CloseNow()
		}
		s.mu.Lock()
		onClose := s.onClose
		s.mu.Unlock()
		onClose()
	}()
	for {
		_, data, err := s.conn.Read(ctx)
		if err != nil {
			return
		}
		s.mu.Lock()
		onMessage := s.onMessage
		s.mu.Unlock()
		onMessage(data)
	}
}
