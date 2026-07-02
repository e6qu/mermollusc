package relay

// Socket is the minimal per-connection interface the core needs — deliberately narrow so a real native
// WebSocket connection and (Milestone 2) an in-process WASM-side connection can both satisfy it without
// the core knowing which one it has.
type Socket interface {
	Send(data []byte)
	Close(code int, reason string)
	IsOpen() bool
	// OnMessage/OnClose register the (single) listener for this socket's lifetime — called at most once,
	// before the socket is handed to Core.Connect.
	OnMessage(listener func(data []byte))
	OnClose(listener func())
}

// Request is the per-connection admission context — deliberately narrow (just what RBAC/auth actually
// read) rather than a real HTTP request, so it's trivial to construct from any transport.
type Request struct {
	URL       string
	AuthToken string
}
