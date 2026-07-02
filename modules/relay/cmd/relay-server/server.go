package main

import (
	"net/http"

	"github.com/coder/websocket"

	"github.com/e6qu/mermollusc/modules/relay/relay"
)

// newHandler builds the single WebSocket-upgrade endpoint every room path resolves against — the room is
// the URL path itself, matched by relay.Core.Connect. Factored out of main() so tests can drive a Core
// over a real ephemeral-port listener without going through env vars / os.Exit.
//
// Deliberately NOT http.ServeMux: ServeMux auto-redirects a request whose path contains repeated slashes
// or `.`/`..` segments to a "cleaned" equivalent before any handler runs — exactly the malformed paths
// relay.Core's own room-name validation exists to reject. A bare handler sees the request exactly as the
// client sent it; r.RequestURI (the raw, unparsed request-target) is passed straight through rather than
// Go's re-serialised r.URL.String(), for the same reason.
func newHandler(core *relay.Core, log relay.Logger) http.Handler {
	// The app and the relay are almost always on different ports (different origins by the browser's
	// definition, even on the same host) — that was already true of the ws-based JS relay this replaces,
	// which never checked Origin at all. coder/websocket's Accept enforces a same-origin check by
	// default; InsecureSkipVerify restores the JS original's behavior. The actual access boundary here is
	// RBAC/auth (Authorizer, RoomAuthorizer), not the WebSocket handshake's Origin header.
	acceptOptions := &websocket.AcceptOptions{InsecureSkipVerify: true}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, acceptOptions)
		if err != nil {
			log.Printf("relay: accept failed — %v", err)
			return
		}
		socket := newWSSocket(conn, log)
		go socket.readLoop(r.Context())
		core.Connect(socket, &relay.Request{URL: r.RequestURI})
	})
}
