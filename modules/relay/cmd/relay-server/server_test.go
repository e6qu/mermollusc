// Ported 1:1 from modules/collab/test/integration/relay.test.mjs — same scenarios, same behavioral
// contract, driven over a real Go WebSocket client this time instead of a real `ws` client. This is the
// primary evidence the Go relay is a true drop-in replacement for the JS one, not a reimplementation with
// its own (possibly diverging) semantics.
package main

import (
	"context"
	"net/http"
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
	srv := httptest.NewServer(newHandler(core, testLogger{t}, newOriginPolicy(""), newSocketRegistry()))
	t.Cleanup(srv.Close)
	return "ws" + strings.TrimPrefix(srv.URL, "http")
}

func openPath(t *testing.T, base, path string) (*websocket.Conn, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, base+path, nil)
	if conn != nil {
		conn.SetReadLimit(maxFrameBytes) // the CLIENT side defaults to 32KiB too — match the server's cap
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

// readAdmission collects the admission sequence: every frame up to and including the initial DOC frame
// (role control, optional seed control, doc state). Bounded by the protocol itself — never by a timeout
// whose context cancellation would close the connection out from under the test.
func readAdmission(t *testing.T, conn *websocket.Conn) [][]byte {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	var frames [][]byte
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatalf("readAdmission: %v", err)
		}
		frames = append(frames, data)
		if len(data) > 0 && data[0] == tagDoc {
			return frames
		}
	}
}

func countSeedGrants(frames [][]byte) int {
	n := 0
	for _, f := range frames {
		if len(f) > 0 && f[0] == tagControl && string(f[1:]) == "seed" {
			n++
		}
	}
	return n
}

func TestSeedGrantGoesToExactlyOneOfTwoJoiners(t *testing.T) {
	base := startTestServer(t, relay.Options{})
	a := open(t, base)
	b := open(t, base)
	total := countSeedGrants(readAdmission(t, a)) + countSeedGrants(readAdmission(t, b))
	if total != 1 {
		t.Fatalf("seed grants across both admissions = %d, want exactly 1", total)
	}
}

func TestSeedGrantNotSentForRoomWithContent(t *testing.T) {
	base := startTestServer(t, relay.Options{})
	a := open(t, base)
	// Seed the room for real, then let the debounced save + broadcast settle.
	send(t, a, frame(tagDoc, docUpdate(t, "flowchart TD\n  X --> Y\n")))
	readUntil(t, a, 2*time.Second, func(f []byte) bool { return len(f) > 0 && f[0] == tagControl })
	time.Sleep(100 * time.Millisecond)

	b := open(t, base)
	if n := countSeedGrants(readAdmission(t, b)); n != 0 {
		t.Fatalf("a joiner of a room WITH content received %d seed grant(s), want 0", n)
	}
}

// dialWithOrigin opens a WebSocket with an explicit browser Origin header, as a cross-site page would.
func dialWithOrigin(t *testing.T, base, origin string) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	conn, resp, err := websocket.Dial(ctx, base+"/board", &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{origin}},
	})
	if conn != nil {
		t.Cleanup(func() { _ = conn.CloseNow() })
	}
	return conn, resp, err
}

func TestOriginPolicyRejectsCrossOriginUpgrade(t *testing.T) {
	base := startTestServer(t, relay.Options{})
	conn, resp, err := dialWithOrigin(t, base, "https://evil.example")
	if err == nil {
		t.Fatal("a cross-origin upgrade was accepted; want a 403 rejection")
	}
	if conn != nil {
		t.Fatal("got a live connection for a cross-origin upgrade")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("cross-origin upgrade response = %v, want 403", resp)
	}
}

func TestOriginPolicyAllowsLoopbackOrigin(t *testing.T) {
	base := startTestServer(t, relay.Options{})
	// The app dev server and the relay run on different ports of the same loopback host — a different
	// origin by the browser's definition, but the local-dev shape the default policy must keep working.
	conn, _, err := dialWithOrigin(t, base, "http://localhost:5173")
	if err != nil {
		t.Fatalf("loopback origin was rejected: %v", err)
	}
	got := readUntil(t, conn, 2*time.Second, func(f []byte) bool { return len(f) > 0 && f[0] == tagControl })
	if len(got) == 0 {
		t.Fatal("no control frame after a loopback-origin upgrade")
	}
}

func TestOriginPolicyAllowsSameHostOrigin(t *testing.T) {
	base := startTestServer(t, relay.Options{})
	// httptest binds 127.0.0.1:<port>; an origin on the same hostname but a different port must pass.
	host := strings.TrimPrefix(base, "ws://")
	hostname := host[:strings.LastIndex(host, ":")]
	conn, _, err := dialWithOrigin(t, base, "http://"+hostname+":9999")
	if err != nil {
		t.Fatalf("same-host origin was rejected: %v", err)
	}
	readUntil(t, conn, 2*time.Second, func(f []byte) bool { return len(f) > 0 && f[0] == tagControl })
}

func TestOriginPolicyAllowsEnvAllowlistedOrigin(t *testing.T) {
	core := relay.New(relay.Options{Store: store.NewMemory(), Logger: testLogger{t}})
	srv := httptest.NewServer(newHandler(
		core, testLogger{t}, newOriginPolicy("https://app.example.com, https://other.example.com"), newSocketRegistry(),
	))
	t.Cleanup(srv.Close)
	base := "ws" + strings.TrimPrefix(srv.URL, "http")

	conn, _, err := dialWithOrigin(t, base, "https://app.example.com")
	if err != nil {
		t.Fatalf("allowlisted origin was rejected: %v", err)
	}
	readUntil(t, conn, 2*time.Second, func(f []byte) bool { return len(f) > 0 && f[0] == tagControl })

	if _, resp, err := dialWithOrigin(t, base, "https://unlisted.example.com"); err == nil {
		t.Fatal("an unlisted cross-origin upgrade was accepted")
	} else if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("unlisted origin response = %v, want 403", resp)
	}
}

// TestLargeDocFrameSurvivesReadLimit reproduces the old failure: coder/websocket's 32KiB default read
// limit killed any DOC frame bigger than that with a 1009 close. A frame under maxFrameBytes must relay.
func TestLargeDocFrameSurvivesReadLimit(t *testing.T) {
	base := startTestServer(t, relay.Options{
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleEditor },
	})
	a, b := open(t, base), open(t, base)
	readUntil(t, a, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	readUntil(t, b, time.Second, func(f []byte) bool { return f[0] == tagDoc })

	big := strings.Repeat("mermollusc ", 10_000) // ~110KB of source — over 32KiB, under maxFrameBytes
	send(t, a, frame(tagDoc, docUpdate(t, big)))
	got := readUntil(t, b, 5*time.Second, func(f []byte) bool { return f[0] == tagDoc && len(f) > 32*1024 })
	if len(got) <= 32*1024 {
		t.Fatalf("large doc frame did not relay (got %d bytes)", len(got))
	}
}

// TestSlowConsumerIsClosedWithoutStallingSenders proves the bounded per-peer send queue: a peer that
// stops reading is torn down (loudly) once its outbound queue overflows, and the sender is never blocked
// waiting on it — broadcast keeps working for healthy peers.
func TestSlowConsumerIsClosedWithoutStallingSenders(t *testing.T) {
	core := relay.New(relay.Options{
		Store:  store.NewMemory(),
		Logger: testLogger{t},
		// A generous limit so the flood below trips the send queue, not the inbound rate limiter.
		RateLimit:     relay.RateLimit{FramesPerSec: 1_000_000, BytesPerSec: 1 << 30},
		AuthorizeRoom: func(*relay.User, string) relay.Role { return relay.RoleEditor },
	})
	srv := httptest.NewServer(newHandler(core, testLogger{t}, newOriginPolicy(""), newSocketRegistry()))
	t.Cleanup(srv.Close)
	base := "ws" + strings.TrimPrefix(srv.URL, "http")

	sender := open(t, base)
	stuck := open(t, base)
	healthy := open(t, base)
	readUntil(t, sender, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	readUntil(t, stuck, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	readUntil(t, healthy, time.Second, func(f []byte) bool { return f[0] == tagDoc })
	// `stuck` now simply never reads again — its OS buffers and then its server-side queue fill up.

	start := time.Now()
	payload := make([]byte, 256*1024)
	deadline := time.Now().Add(20 * time.Second)
	for i := 0; time.Now().Before(deadline); i++ {
		send(t, sender, frame(tagAware, payload))
		// The healthy peer keeps receiving — if broadcast were synchronous on the stuck peer, this
		// read (and the sends above) would stall for the full write timeout per frame.
		got := readUntil(t, healthy, 5*time.Second, func(f []byte) bool { return f[0] == tagAware })
		if got == nil {
			t.Fatal("healthy peer stopped receiving")
		}
		if i*len(payload) > 3*sendQueueBytes {
			break // more than enough to overflow the stuck peer's queue
		}
	}
	if elapsed := time.Since(start); elapsed > 15*time.Second {
		t.Fatalf("broadcast stalled on the stuck peer (took %v)", elapsed)
	}
	// The stuck peer must have been closed by the relay (queue overflow), not left half-alive.
	code := closeCode(t, stuck, 10*time.Second)
	if code == 0 {
		t.Fatalf("stuck peer was never closed")
	}
}

func TestSeedGrantMovesToSurvivorWhenSeederLeavesEmptyRoom(t *testing.T) {
	base := startTestServer(t, relay.Options{})
	a := open(t, base)
	// A holds the grant (first into the empty room) but never seeds.
	if n := countSeedGrants(readAdmission(t, a)); n != 1 {
		t.Fatalf("first joiner received %d grant(s), want 1", n)
	}
	b := open(t, base)
	if n := countSeedGrants(readAdmission(t, b)); n != 0 {
		t.Fatalf("second joiner received %d grant(s) while the seeder was alive, want 0", n)
	}
	// The seeder dies without seeding — the grant must move to B, or the room stays empty forever.
	_ = a.CloseNow()
	got := readUntil(t, b, 2*time.Second, func(f []byte) bool {
		return len(f) > 0 && f[0] == tagControl && string(f[1:]) == "seed"
	})
	if got == nil {
		t.Fatal("survivor never received the re-granted seed control")
	}
}
