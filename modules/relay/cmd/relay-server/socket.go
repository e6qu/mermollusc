package main

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"

	"github.com/e6qu/mermollusc/modules/relay/relay"
)

// maxFrameBytes caps a single inbound WebSocket frame. coder/websocket defaults to 32KiB, which killed
// any legitimate DOC snapshot bigger than that with a 1009 close; 4MiB matches the rate limiter's
// per-second byte bucket (relay.DefaultRateLimit.BytesPerSec), so one maximal frame is exactly one
// second's allowance — larger frames are a policy breach on either cap.
const maxFrameBytes = 4 * 1024 * 1024

// sendQueueBytes bounds the per-peer outbound backlog. A peer that stops reading fills its queue and is
// closed (loudly) instead of stalling every sender in the room — broadcast enqueues and returns.
const sendQueueBytes = 8 * 1024 * 1024

const defaultWriteTimeout = 10 * time.Second

// wsSocket adapts a real coder/websocket connection to relay.Socket. Send enqueues onto a bounded
// per-peer queue drained by writeLoop, so one stuck peer can never stall the broadcasting goroutine;
// queue overflow and write errors/timeouts close the peer loudly. OnMessage/OnClose registration
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

	sendQ        chan []byte
	queuedBytes  atomic.Int64
	stop         chan struct{}
	writeTimeout time.Duration

	log relay.Logger
}

func newWSSocket(conn *websocket.Conn, log relay.Logger) *wsSocket {
	conn.SetReadLimit(maxFrameBytes)
	s := &wsSocket{
		conn:         conn,
		log:          log,
		ready:        make(chan struct{}),
		sendQ:        make(chan []byte, 512),
		stop:         make(chan struct{}),
		writeTimeout: defaultWriteTimeout,
	}
	s.open.Store(true)
	go s.writeLoop()
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

// shutdown transitions open→closed exactly once: stops the write loop, then runs the winner's close
// action. Subsequent callers are no-ops.
func (s *wsSocket) shutdown(closeConn func()) {
	if !s.open.CompareAndSwap(true, false) {
		return
	}
	close(s.stop)
	closeConn()
}

// Send never blocks on the peer: it enqueues for writeLoop. A full queue means the peer stopped reading
// faster than the room produces — close it loudly rather than backing up every sender.
func (s *wsSocket) Send(data []byte) {
	if !s.open.Load() {
		return
	}
	if s.queuedBytes.Add(int64(len(data))) > sendQueueBytes {
		s.queuedBytes.Add(-int64(len(data)))
		s.log.Printf("relay: peer send queue overflowed (slow consumer) — closing peer")
		s.shutdown(func() { _ = s.conn.CloseNow() })
		return
	}
	select {
	case s.sendQ <- data:
	default:
		s.queuedBytes.Add(-int64(len(data)))
		s.log.Printf("relay: peer send queue overflowed (slow consumer) — closing peer")
		s.shutdown(func() { _ = s.conn.CloseNow() })
	}
}

// writeLoop drains the send queue onto the connection. A write error or timeout closes the peer — its
// readLoop then observes the closed connection and drives the normal OnClose teardown (dropSocket).
func (s *wsSocket) writeLoop() {
	for {
		select {
		case data := <-s.sendQ:
			s.queuedBytes.Add(-int64(len(data)))
			ctx, cancel := context.WithTimeout(context.Background(), s.writeTimeout)
			err := s.conn.Write(ctx, websocket.MessageBinary, data)
			cancel()
			if err != nil {
				s.log.Printf("relay: socket write failed — closing peer: %v", err)
				s.shutdown(func() { _ = s.conn.CloseNow() })
				return
			}
		case <-s.stop:
			return
		}
	}
}

func (s *wsSocket) Close(code int, reason string) {
	s.shutdown(func() { _ = s.conn.Close(websocket.StatusCode(code), reason) })
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
		s.shutdown(func() { _ = s.conn.CloseNow() })
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
