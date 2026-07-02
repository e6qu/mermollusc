// Ported 1:1 from modules/collab/test/integration/relay.test.mjs — same scenarios, same behavioral
// contract, driven over a real Go WebSocket client this time instead of a real `ws` client. This is the
// primary evidence the Go relay is a true drop-in replacement for the JS one, not a reimplementation with
// its own (possibly diverging) semantics.
package main

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	ycrdt "github.com/skyterra/y-crdt"

	"github.com/e6qu/mermollusc/modules/relay/relay"
	"github.com/e6qu/mermollusc/modules/relay/store"
)

type testLogger struct{ t *testing.T }

func (l testLogger) Printf(format string, args ...any) { l.t.Logf(format, args...) }

const (
	tagDoc     byte = 0
	tagAware   byte = 1
	tagControl byte = 2
	tagAuth    byte = 3
)

func frame(tag byte, payload []byte) []byte {
	f := make([]byte, len(payload)+1)
	f[0] = tag
	copy(f[1:], payload)
	return f
}

func authFrame(token string) []byte { return frame(tagAuth, []byte(token)) }

func docUpdate(t *testing.T, text string) []byte {
	t.Helper()
	doc := ycrdt.NewDoc("t", false, nil, nil, false)
	ytext := doc.GetText("source")
	doc.Transact(func(trans *ycrdt.Transaction) {
		ytext.Insert(0, text, nil)
	}, nil)
	return ycrdt.EncodeStateAsUpdate(doc, nil)
}

// startTestServer builds a Core from opts (defaulting Store to a fresh memory store) and serves it over a
// real ephemeral-port httptest server, cleaned up automatically at test end.
func startTestServer(t *testing.T, opts relay.Options) string {
	t.Helper()
	if opts.Store == nil {
		opts.Store = store.NewMemory()
	}
	opts.Logger = testLogger{t}
	core := relay.New(opts)
	srv := httptest.NewServer(newHandler(core, testLogger{t}))
	t.Cleanup(srv.Close)
	return "ws" + strings.TrimPrefix(srv.URL, "http")
}

func openPath(t *testing.T, base, path string) (*websocket.Conn, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, base+path, nil)
	if conn != nil {
		t.Cleanup(func() { _ = conn.CloseNow() })
	}
	return conn, err
}

func open(t *testing.T, base string) *websocket.Conn {
	t.Helper()
	conn, err := openPath(t, base, "/board")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	return conn
}

// readUntil reads frames (with an overall deadline) until pred returns true for one, returning it. Fails
// the test if the deadline is hit or the connection closes first.
func readUntil(t *testing.T, conn *websocket.Conn, timeout time.Duration, pred func(frame []byte) bool) []byte {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatalf("readUntil: %v (close status %d)", err, websocket.CloseStatus(err))
		}
		if pred(data) {
			return data
		}
	}
}

// closeCode reads until the connection closes (or errors), returning the close status code.
func closeCode(t *testing.T, conn *websocket.Conn, timeout time.Duration) websocket.StatusCode {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	for {
		_, _, err := conn.Read(ctx)
		if err != nil {
			return websocket.CloseStatus(err)
		}
	}
}

func send(t *testing.T, conn *websocket.Conn, data []byte) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := conn.Write(ctx, websocket.MessageBinary, data); err != nil {
		t.Fatalf("send: %v", err)
	}
}

func TestRBACAnnouncesGrantedRole(t *testing.T) {
	base := startTestServer(t, relay.Options{
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleViewer },
	})
	conn := open(t, base)
	got := readUntil(t, conn, 2*time.Second, func(f []byte) bool { return len(f) > 0 && f[0] == tagControl })
	if want := "viewer"; string(got[1:]) != want {
		t.Errorf("control frame = %q, want %q", got[1:], want)
	}
}

func TestRBACViewerReadOnlyEditorReadWrite(t *testing.T) {
	viewerBase := startTestServer(t, relay.Options{
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleViewer },
	})
	va, vb := open(t, viewerBase), open(t, viewerBase)
	// drain both peers' control+doc frames first
	readUntil(t, va, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	readUntil(t, vb, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	send(t, va, frame(tagDoc, docUpdate(t, "viewer edit")))
	// vb must NOT receive a further doc frame — read with a short deadline and expect a timeout.
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	if _, data, err := vb.Read(ctx); err == nil {
		t.Fatalf("viewer edit was relayed: tag=%d", data[0])
	}

	editorBase := startTestServer(t, relay.Options{
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleEditor },
	})
	ea, eb := open(t, editorBase), open(t, editorBase)
	readUntil(t, ea, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	readUntil(t, eb, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	send(t, ea, frame(tagDoc, docUpdate(t, "editor edit")))
	got := readUntil(t, eb, 2*time.Second, func(f []byte) bool { return f[0] == tagDoc && len(f) > 1 })
	if len(got) <= 1 {
		t.Errorf("editor edit did not propagate")
	}
}

func TestForbiddenRoomCloses1008(t *testing.T) {
	base := startTestServer(t, relay.Options{
		AuthorizeRoom: func(*relay.User, string) relay.Role { return "" },
	})
	conn := open(t, base)
	code := closeCode(t, conn, 2*time.Second)
	if code != websocket.StatusPolicyViolation {
		t.Errorf("close code = %d, want %d", code, websocket.StatusPolicyViolation)
	}
}

func TestBadTokenCloses1008(t *testing.T) {
	base := startTestServer(t, relay.Options{
		AuthRequired: true,
		Authorize: func(_ context.Context, req *relay.Request) (relay.AuthResult, error) {
			return relay.AuthResult{OK: req.AuthToken == "good", Reason: "bad token"}, nil
		},
	})
	conn := open(t, base)
	send(t, conn, authFrame("bad"))
	code := closeCode(t, conn, 2*time.Second)
	if code != websocket.StatusPolicyViolation {
		t.Errorf("close code = %d, want %d", code, websocket.StatusPolicyViolation)
	}
}

func TestAuthenticatesFromFrameNotURLQuery(t *testing.T) {
	type seen struct {
		token, url string
	}
	var got []seen
	base := startTestServer(t, relay.Options{
		AuthRequired: true,
		Authorize: func(_ context.Context, req *relay.Request) (relay.AuthResult, error) {
			got = append(got, seen{req.AuthToken, req.URL})
			return relay.AuthResult{OK: req.AuthToken == "frame-token"}, nil
		},
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleEditor },
	})
	conn, err := openPath(t, base, "/board?token=url-token")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	send(t, conn, authFrame("frame-token"))
	control := readUntil(t, conn, 2*time.Second, func(f []byte) bool { return f[0] == tagControl })
	if string(control[1:]) != "editor" {
		t.Errorf("control = %q, want editor", control[1:])
	}
	if len(got) != 1 || got[0].token != "frame-token" || !strings.Contains(got[0].url, "token=url-token") {
		t.Errorf("authorize saw %+v", got)
	}
}

func TestCrashGuardSurvivesMalformedUpdate(t *testing.T) {
	base := startTestServer(t, relay.Options{
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleEditor },
	})
	a, b := open(t, base), open(t, base)
	readUntil(t, a, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	readUntil(t, b, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	send(t, a, frame(tagDoc, []byte{255, 254, 253, 1, 2, 3}))
	send(t, a, frame(tagDoc, docUpdate(t, "still alive")))
	got := readUntil(t, b, 2*time.Second, func(f []byte) bool { return f[0] == tagDoc && len(f) > 1 })
	if len(got) <= 1 {
		t.Errorf("relay did not survive / did not keep relaying")
	}
}

func TestRoomNameDotDotSegmentCloses1008(t *testing.T) {
	base := startTestServer(t, relay.Options{
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleEditor },
	})
	conn, _ := openPath(t, base, "/a%2F..%2Fb")
	code := closeCode(t, conn, 2*time.Second)
	if code != websocket.StatusPolicyViolation {
		t.Errorf("close code = %d, want %d", code, websocket.StatusPolicyViolation)
	}
}

func TestRoomNameEmptySegmentCloses1008(t *testing.T) {
	base := startTestServer(t, relay.Options{
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleEditor },
	})
	conn, _ := openPath(t, base, "/a//b")
	code := closeCode(t, conn, 2*time.Second)
	if code != websocket.StatusPolicyViolation {
		t.Errorf("close code = %d, want %d", code, websocket.StatusPolicyViolation)
	}
}

func TestRoomNameThreeSegmentsCloses1008(t *testing.T) {
	base := startTestServer(t, relay.Options{
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleEditor },
	})
	conn, _ := openPath(t, base, "/tenant/board/extra")
	code := closeCode(t, conn, 2*time.Second)
	if code != websocket.StatusPolicyViolation {
		t.Errorf("close code = %d, want %d", code, websocket.StatusPolicyViolation)
	}
}

func TestTagAllowListDropsUnknownAndControlRelaysPresence(t *testing.T) {
	base := startTestServer(t, relay.Options{
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleEditor },
	})
	a, b := open(t, base), open(t, base)
	readUntil(t, a, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	readUntil(t, b, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	send(t, a, frame(99, []byte{1, 2, 3}))
	send(t, a, frame(tagControl, []byte{1}))
	send(t, a, frame(tagAware, []byte{9, 9}))
	got := readUntil(t, b, 2*time.Second, func(f []byte) bool { return f[0] == tagAware })
	if got[0] != tagAware {
		t.Errorf("presence was not relayed")
	}
}

func TestFrameRateLimitCloses1008(t *testing.T) {
	base := startTestServer(t, relay.Options{
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleEditor },
		RateLimit:     relay.RateLimit{FramesPerSec: 1, BytesPerSec: 10 * 1024 * 1024},
	})
	conn := open(t, base)
	readUntil(t, conn, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	for i := 0; i < 5; i++ {
		send(t, conn, frame(tagAware, []byte{byte(i)}))
	}
	code := closeCode(t, conn, 2*time.Second)
	if code != websocket.StatusPolicyViolation {
		t.Errorf("close code = %d, want %d", code, websocket.StatusPolicyViolation)
	}
}

func TestByteRateLimitCloses1008(t *testing.T) {
	base := startTestServer(t, relay.Options{
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleEditor },
		RateLimit:     relay.RateLimit{FramesPerSec: 1000, BytesPerSec: 16},
	})
	conn := open(t, base)
	readUntil(t, conn, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	send(t, conn, frame(tagAware, make([]byte, 64)))
	code := closeCode(t, conn, 2*time.Second)
	if code != websocket.StatusPolicyViolation {
		t.Errorf("close code = %d, want %d", code, websocket.StatusPolicyViolation)
	}
}
