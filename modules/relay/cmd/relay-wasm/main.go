//go:build js && wasm

// Command relay-wasm exposes the exact same relay.Core production runs to the browser, compiled to
// WebAssembly and driven in-process by the backend-free demo instead of over a real network socket — see
// modules/relay/PLAN.md and modules/collab/src/shell/wasm-relay.ts for the two ends of this seam.
//
// Zero-auth by the same config-driven logic as local dev (no AUTH0_DOMAIN/AUTH0_AUDIENCE — there is no
// env in a browser tab to read them from), not a demo-specific code path: this file never imports the
// auth package at all, which also keeps the compiled binary from carrying unused JWKS-fetch code.
//
// The one hazard specific to this target: calling an async JS API (here, the JS-provided Store
// load/save, which wrap the browser's real IndexedDB) from a Go goroutine deadlocks the single-threaded
// WASM runtime if done synchronously from within a js.FuncOf callback's own call stack — the callback
// must return before the JS event loop can run the microtask that would unblock it. Every exported
// function whose call chain can reach the Store (loadRoom on first connect, a debounced/flushed save on
// close) runs inside its own goroutine, never inline in the js.FuncOf handler. This is the same
// constraint, and the same fix, Go's own net/http uses for GOOS=js GOARCH=wasm (see
// go/src/net/http/roundtrip_js.go) — awaitPromise below is that library's documented pattern, not a
// novel technique.
package main

import (
	"fmt"
	"sync"
	"syscall/js"

	"github.com/e6qu/mermollusc/modules/relay/relay"
)

func uint8ArrayToBytes(v js.Value) []byte {
	if v.IsNull() || v.IsUndefined() {
		return nil
	}
	b := make([]byte, v.Get("length").Int())
	js.CopyBytesToGo(b, v)
	return b
}

func bytesToUint8Array(b []byte) js.Value {
	arr := js.Global().Get("Uint8Array").New(len(b))
	js.CopyBytesToJS(arr, b)
	return arr
}

// awaitPromise bridges a JS Promise into a blocking call from within a goroutine (never call this
// directly inside a js.FuncOf handler — see the package doc comment).
func awaitPromise(promise js.Value) (js.Value, error) {
	resultCh := make(chan js.Value, 1)
	errCh := make(chan error, 1)
	var success, failure js.Func
	success = js.FuncOf(func(_ js.Value, args []js.Value) any {
		success.Release()
		failure.Release()
		if len(args) > 0 {
			resultCh <- args[0]
		} else {
			resultCh <- js.Undefined()
		}
		return nil
	})
	failure = js.FuncOf(func(_ js.Value, args []js.Value) any {
		success.Release()
		failure.Release()
		reason := "unknown error"
		if len(args) > 0 {
			reason = args[0].Call("toString").String()
		}
		errCh <- fmt.Errorf("%s", reason)
		return nil
	})
	promise.Call("then", success, failure)
	select {
	case v := <-resultCh:
		return v, nil
	case err := <-errCh:
		return js.Value{}, err
	}
}

// newPromise wraps an async Go operation as a JS Promise, so callers that need to know when it finished
// (e.g. a flush before the page unloads) can await it.
func newPromise(work func() error) js.Value {
	handler := js.FuncOf(func(_ js.Value, args []js.Value) any {
		resolve, reject := args[0], args[1]
		go func() {
			if err := work(); err != nil {
				reject.Invoke(err.Error())
				return
			}
			resolve.Invoke()
		}()
		return nil
	})
	return js.Global().Get("Promise").New(handler)
}

// jsStore bridges relay.Store to JS-provided async load/save callbacks wrapping the browser's real
// IndexedDB-backed RoomStore — IndexedDB access itself stays in TypeScript, never reimplemented in Go.
type jsStore struct {
	onLoad js.Value // (room: string) => Promise<Uint8Array | null>
	onSave js.Value // (room: string, snapshot: Uint8Array) => Promise<void>
}

func (s *jsStore) Load(room string) ([]byte, error) {
	result, err := awaitPromise(s.onLoad.Invoke(room))
	if err != nil {
		return nil, err
	}
	return uint8ArrayToBytes(result), nil
}

func (s *jsStore) Save(room string, snapshot []byte) error {
	_, err := awaitPromise(s.onSave.Invoke(room, bytesToUint8Array(snapshot)))
	return err
}

// jsSocket bridges relay.Socket to a JS-side CollabSocket peer: Send calls onSend directly (a plain
// synchronous JS function call, not a promise — never a deadlock hazard); the JS side drives incoming
// data/close by calling relayReceive/relayClose, which invoke the listeners OnMessage/OnClose registered.
type jsSocket struct {
	mu        sync.Mutex
	open      bool
	onSend    js.Value
	onMessage func(data []byte)
	onClose   func()
}

func (s *jsSocket) Send(data []byte) { s.onSend.Invoke(bytesToUint8Array(data)) }

func (s *jsSocket) Close(int, string) {
	s.mu.Lock()
	s.open = false
	s.mu.Unlock()
}

func (s *jsSocket) IsOpen() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.open
}

func (s *jsSocket) OnMessage(listener func(data []byte)) { s.onMessage = listener }
func (s *jsSocket) OnClose(listener func())              { s.onClose = listener }

var (
	mu          sync.Mutex
	core        *relay.Core
	connections = make(map[int]*jsSocket)
	nextHandle  = 0
)

// relayConnect(room, onSend, onLoad, onSave) -> handle. The Core is built once, lazily, on the first
// call — a single browser tab's demo session, matching a real relay's one-Core-many-connections shape
// rather than a per-connection reimplementation.
func relayConnect(_ js.Value, args []js.Value) any {
	room := args[0].String()
	socket := &jsSocket{open: true, onSend: args[1]}
	store := &jsStore{onLoad: args[2], onSave: args[3]}

	mu.Lock()
	if core == nil {
		core = relay.New(relay.Options{Store: store, Authorize: relay.AllowAll})
	}
	handle := nextHandle
	nextHandle++
	connections[handle] = socket
	mu.Unlock()

	go core.Connect(socket, &relay.Request{URL: "/" + room})

	return handle
}

func relayReceive(_ js.Value, args []js.Value) any {
	handle := args[0].Int()
	data := uint8ArrayToBytes(args[1])
	mu.Lock()
	socket, ok := connections[handle]
	mu.Unlock()
	if ok && socket.onMessage != nil {
		socket.onMessage(data)
	}
	return nil
}

func relayClose(_ js.Value, args []js.Value) any {
	handle := args[0].Int()
	mu.Lock()
	socket, ok := connections[handle]
	delete(connections, handle)
	mu.Unlock()
	if !ok {
		return nil
	}
	socket.Close(1000, "client close")
	if socket.onClose != nil {
		go socket.onClose()
	}
	return nil
}

// relayFlush() -> Promise<void>. Persists every room's latest snapshot — call before the page unloads
// for the same durability guarantee a clean server shutdown gives (best-effort: browsers don't reliably
// wait for async work in unload handlers, same limitation any web app has here).
func relayFlush(_ js.Value, _ []js.Value) any {
	return newPromise(func() error {
		mu.Lock()
		c := core
		mu.Unlock()
		if c != nil {
			c.FlushAll()
		}
		return nil
	})
}

func main() {
	js.Global().Set("mermolluscRelayConnect", js.FuncOf(relayConnect))
	js.Global().Set("mermolluscRelayReceive", js.FuncOf(relayReceive))
	js.Global().Set("mermolluscRelayClose", js.FuncOf(relayClose))
	js.Global().Set("mermolluscRelayFlush", js.FuncOf(relayFlush))
	select {} // keep the WASM runtime alive — the JS side drives everything from here via the globals above
}
