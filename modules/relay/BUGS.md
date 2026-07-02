# @m/relay — bugs

No known open bugs.

Caught and fixed during the Go port (not shipped, so not "resolved" issues in the usual sense — flagged
here because they're exactly the kind of thing worth remembering when touching this code again):

- **`http.ServeMux`'s implicit path-cleaning silently defeated room-name validation.** `ServeMux`
  auto-redirects a request with repeated slashes or `.`/`..` segments to a "cleaned" URL before any
  handler runs; `websocket.Dial` transparently followed the redirect, so a malformed room path like
  `/a//b` was silently rewritten to `/a/b` — a *valid* room — before `relay.Core`'s own validation ever
  saw it. Caught by the ported `TestRoomNameEmptySegmentCloses1008` test. Fixed by not using `ServeMux` at
  all (`cmd/relay-server/server.go` uses a bare `http.HandlerFunc` and reads `r.RequestURI`, the raw
  unparsed request-target, instead of Go's re-serialised `r.URL.String()`).
- **A data race in the native transport adapter.** `wsSocket.OnMessage`/`OnClose` (called by `Core.Connect`
  to register listeners) and `readLoop`'s dispatch (running in its own goroutine, started concurrently)
  raced on the listener fields with no synchronization — a real bug specific to porting from JS's
  single-threaded event loop to Go's actual concurrency, not something the JS source ever had to guard
  against. Caught by `go test -race`. Fixed with a mutex plus a `ready` gate so `readLoop` never dispatches
  before both listeners are registered (closing a second, quieter gap: a frame arriving in that window
  would otherwise have been silently dropped, not just raced).
- **Concurrent first-touch of a brand-new room could create two divergent `Doc`s.** Making `Store.Load`
  properly awaitable (for a future async store) put real work between the room-registry's "does this room
  exist" check and its "create it" step — a window two real concurrent connections could both fall into,
  each building their own `Doc` for the same room name. Unreachable in the JS original (no `await` inside
  the equivalent check-then-create, so single-threaded execution ran it atomically); reachable under Go's
  real parallelism. Fixed with a request-coalescing guard in `loadRoom` (concurrent first-touches of the
  same new room share one in-flight load).
