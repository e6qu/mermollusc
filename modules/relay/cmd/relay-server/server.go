package main

import (
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"github.com/coder/websocket"

	"github.com/e6qu/mermollusc/modules/relay/relay"
)

// originPolicy decides which browser Origins may open a WebSocket to this relay. Auth (when enabled)
// authenticates the USER, not the PAGE: a malicious website in a signed-in user's browser would still
// connect with that user's ambient credentials — so the Origin check applies regardless of auth. Allowed:
// requests without an Origin header (non-browser clients — no browser threat model applies), loopback
// origins, origins on the same hostname the request was addressed to (the app and the relay share a host
// but not a port in every real deployment), and an explicit env-configured allowlist (ALLOWED_ORIGINS,
// comma-separated full origins like https://app.example.com).
type originPolicy struct {
	allowlist map[string]struct{}
}

func newOriginPolicy(allowedOrigins string) *originPolicy {
	allowlist := make(map[string]struct{})
	for _, o := range strings.Split(allowedOrigins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			allowlist[strings.ToLower(o)] = struct{}{}
		}
	}
	return &originPolicy{allowlist: allowlist}
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (p *originPolicy) allowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	if _, ok := p.allowlist[strings.ToLower(origin)]; ok {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
	}
	originHost := u.Hostname()
	if isLoopbackHost(originHost) {
		return true
	}
	requestHost := r.Host
	if h, _, err := net.SplitHostPort(requestHost); err == nil {
		requestHost = h
	}
	return strings.EqualFold(originHost, requestHost)
}

// socketRegistry tracks every live wsSocket so a clean shutdown can close them all and WAIT for their
// connection goroutines to finish (which flushes each room via the normal last-socket-out path) BEFORE
// the final FlushAll — otherwise edits still inside the save-debounce window at SIGTERM would be lost.
// net/http's own Server.Shutdown cannot do this: coder/websocket hijacks the connection, and hijacked
// connections are excluded from Shutdown's graceful wait.
type socketRegistry struct {
	mu       sync.Mutex
	sockets  map[*wsSocket]struct{}
	draining bool
	wg       sync.WaitGroup
}

func newSocketRegistry() *socketRegistry {
	return &socketRegistry{sockets: make(map[*wsSocket]struct{})}
}

// add registers a live socket; if the server is already draining, the socket is refused (closed) and
// add reports false.
func (reg *socketRegistry) add(s *wsSocket) bool {
	reg.mu.Lock()
	if reg.draining {
		reg.mu.Unlock()
		s.Close(1001, "server shutting down")
		return false
	}
	reg.sockets[s] = struct{}{}
	reg.wg.Add(1)
	reg.mu.Unlock()
	return true
}

func (reg *socketRegistry) remove(s *wsSocket) {
	reg.mu.Lock()
	delete(reg.sockets, s)
	reg.mu.Unlock()
	reg.wg.Done()
}

// drain closes every live connection and blocks until their handlers have fully torn down (room flushes
// included).
func (reg *socketRegistry) drain() {
	reg.mu.Lock()
	reg.draining = true
	open := make([]*wsSocket, 0, len(reg.sockets))
	for s := range reg.sockets {
		open = append(open, s)
	}
	reg.mu.Unlock()
	for _, s := range open {
		s.Close(1001, "server shutting down")
	}
	reg.wg.Wait()
}

// newHandler builds the single WebSocket-upgrade endpoint every room path resolves against — the room is
// the URL path itself, matched by relay.Core.Connect. Factored out of main() so tests can drive a Core
// over a real ephemeral-port listener without going through env vars / os.Exit.
//
// Deliberately NOT http.ServeMux: ServeMux auto-redirects a request whose path contains repeated slashes
// or `.`/`..` segments to a "cleaned" equivalent before any handler runs — exactly the malformed paths
// relay.Core's own room-name validation exists to reject. A bare handler sees the request exactly as the
// client sent it; r.RequestURI (the raw, unparsed request-target) is passed straight through rather than
// Go's re-serialised r.URL.String(), for the same reason.
func newHandler(core *relay.Core, log relay.Logger, origins *originPolicy, reg *socketRegistry) http.Handler {
	// The Origin check runs BEFORE the upgrade, ours not coder/websocket's, so a rejection is a loud 403
	// with a logged origin instead of the library's generic handshake error. InsecureSkipVerify only
	// disables the library's own (already-performed-here) check — it is not skipping verification.
	acceptOptions := &websocket.AcceptOptions{InsecureSkipVerify: true}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !origins.allowed(r) {
			log.Printf("relay: rejected cross-origin upgrade from %q", r.Header.Get("Origin"))
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}
		conn, err := websocket.Accept(w, r, acceptOptions)
		if err != nil {
			log.Printf("relay: accept failed — %v", err)
			return
		}
		socket := newWSSocket(conn, log)
		if !reg.add(socket) {
			return
		}
		defer reg.remove(socket)
		go socket.readLoop(r.Context())
		core.Connect(socket, &relay.Request{URL: r.RequestURI})
	})
}
