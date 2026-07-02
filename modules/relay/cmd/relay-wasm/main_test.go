//go:build js && wasm

package main

import (
	"syscall/js"
	"testing"
	"time"

	ycrdt "github.com/skyterra/y-crdt"
)

// jsFunc wraps a Go callback as a JS-callable function for tests. Deliberately never Release()d — these
// are short-lived test fixtures, not a long-running program that needs to reclaim them.
func jsFunc(fn func(args []js.Value) any) js.Value {
	f := js.FuncOf(func(_ js.Value, args []js.Value) any {
		return fn(args)
	})
	return f.Value
}

func resolvedPromise(value js.Value) js.Value {
	return js.Global().Get("Promise").Call("resolve", value)
}

// TestConnectAdmissionSendsControlThenDoc drives relayConnect with fake JS callbacks (an in-memory
// onLoad/onSave, and an onSend that captures frames) and confirms the same admission sequence a real
// socket-backed connection gets: a CONTROL frame announcing the (zero-auth, default) role, then a DOC
// frame with the room's initial state.
func TestConnectAdmissionSendsControlThenDoc(t *testing.T) {
	core = nil // fresh Core per test — package state is otherwise shared across TestXxx functions
	connections = make(map[int]*jsSocket)
	nextHandle = 0

	sent := make(chan []byte, 10)
	onSend := jsFunc(func(args []js.Value) any {
		sent <- uint8ArrayToBytes(args[0])
		return nil
	})
	onLoad := jsFunc(func(_ []js.Value) any { return resolvedPromise(js.Null()) })
	onSave := jsFunc(func(_ []js.Value) any { return resolvedPromise(js.Undefined()) })

	handleVal := relayConnect(js.Undefined(), []js.Value{js.ValueOf("test-room"), onSend, onLoad, onSave})
	handle, ok := handleVal.(int)
	if !ok {
		t.Fatalf("relayConnect returned %T, want int", handleVal)
	}

	var frames [][]byte
	timeout := time.After(2 * time.Second)
	for len(frames) < 2 {
		select {
		case f := <-sent:
			frames = append(frames, f)
		case <-timeout:
			t.Fatalf("timed out waiting for admission frames, got %d so far: %v", len(frames), frames)
		}
	}
	if len(frames[0]) == 0 || frames[0][0] != 2 {
		t.Errorf("first frame tag = %v, want CONTROL (2)", frames[0])
	}
	if got := string(frames[0][1:]); got != "editor" {
		t.Errorf("control role = %q, want editor (zero-auth default)", got)
	}
	if len(frames[1]) == 0 || frames[1][0] != 0 {
		t.Errorf("second frame tag = %v, want DOC (0)", frames[1])
	}

	relayClose(js.Undefined(), []js.Value{js.ValueOf(handle)})
}

// TestReceiveRelaysBetweenTwoConnectionsInTheSameRoom proves relayReceive actually drives the shared
// Core: two connections (as two browser tabs sharing one WASM instance would never really do — the demo
// is single-tab — but this is the same mechanism a real relay uses for N sockets, so it's the most direct
// way to prove relayReceive reaches Core.Connect's real broadcast path, not a stub).
func TestReceiveRelaysBetweenTwoConnectionsInTheSameRoom(t *testing.T) {
	core = nil
	connections = make(map[int]*jsSocket)
	nextHandle = 0

	newConn := func(room string) (handle int, sent chan []byte) {
		sent = make(chan []byte, 10)
		onSend := jsFunc(func(args []js.Value) any {
			sent <- uint8ArrayToBytes(args[0])
			return nil
		})
		onLoad := jsFunc(func(_ []js.Value) any { return resolvedPromise(js.Null()) })
		onSave := jsFunc(func(_ []js.Value) any { return resolvedPromise(js.Undefined()) })
		hv := relayConnect(js.Undefined(), []js.Value{js.ValueOf(room), onSend, onLoad, onSave})
		h, ok := hv.(int)
		if !ok {
			t.Fatalf("relayConnect returned %T, want int", hv)
		}
		return h, sent
	}
	drainAdmission := func(sent chan []byte) {
		timeout := time.After(2 * time.Second)
		for i := 0; i < 2; i++ {
			select {
			case <-sent:
			case <-timeout:
				t.Fatalf("timed out draining admission frames")
			}
		}
	}

	handleA, sentA := newConn("shared-room")
	drainAdmission(sentA)
	_, sentB := newConn("shared-room")
	drainAdmission(sentB)

	// A doc update from A must reach B (the real relay broadcast path — RBAC/rate-limit/CRDT-merge all
	// still run, this isn't a bypass). The payload must be a genuine Yjs update — arbitrary bytes would
	// hit the crash guard and never reach the broadcast loop, which would make this test pass for the
	// wrong reason.
	doc := ycrdt.NewDoc("t", false, nil, nil, false)
	doc.Transact(func(tr *ycrdt.Transaction) {
		doc.GetText("source").Insert(0, "hi", nil)
	}, nil)
	update := ycrdt.EncodeStateAsUpdate(doc, nil)
	docFrame := append([]byte{0}, update...) // tag 0 = DOC
	relayReceive(js.Undefined(), []js.Value{js.ValueOf(handleA), bytesToUint8Array(docFrame)})

	select {
	case got := <-sentB:
		if got[0] != 0 {
			t.Errorf("relayed frame tag = %d, want DOC (0)", got[0])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for the relayed frame at B")
	}
}

// TestStoreLoadReturnsErrorFromRejectedPromise proves jsStore.Load surfaces a JS-side rejection as a Go
// error (not silently treated as "no snapshot") — the awaitPromise bridge's failure path.
func TestStoreLoadReturnsErrorFromRejectedPromise(t *testing.T) {
	onLoad := jsFunc(func(_ []js.Value) any {
		return js.Global().Get("Promise").Call("reject", js.Global().Get("Error").New("boom"))
	})
	s := &jsStore{onLoad: onLoad}
	_, err := s.Load("room")
	if err == nil {
		t.Fatal("expected an error from a rejected load promise, got nil")
	}
}

// TestRelayFlushResolves proves relayFlush returns a real Promise that resolves once FlushAll completes,
// so JS can await it (e.g. before the page unloads) rather than firing-and-forgetting a save.
func TestRelayFlushResolves(t *testing.T) {
	core = nil
	connections = make(map[int]*jsSocket)
	nextHandle = 0

	onSend := jsFunc(func(_ []js.Value) any { return nil })
	onLoad := jsFunc(func(_ []js.Value) any { return resolvedPromise(js.Null()) })
	saved := make(chan struct{}, 1)
	onSave := jsFunc(func(_ []js.Value) any {
		select {
		case saved <- struct{}{}:
		default:
		}
		return resolvedPromise(js.Undefined())
	})
	relayConnect(js.Undefined(), []js.Value{js.ValueOf("flush-room"), onSend, onLoad, onSave})

	promise, ok := relayFlush(js.Undefined(), nil).(js.Value)
	if !ok {
		t.Fatalf("relayFlush did not return a js.Value")
	}
	done := make(chan struct{})
	promise.Call("then", jsFunc(func(_ []js.Value) any { close(done); return nil }))
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("relayFlush's promise never resolved")
	}
}
