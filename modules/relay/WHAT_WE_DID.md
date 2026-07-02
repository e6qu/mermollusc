# @m/relay — work log

- Stood up the module and ported the collaborative relay from `modules/collab/server/*.mjs` to Go
  (Milestone 1: native parity). Verified `github.com/skyterra/y-crdt` (an unofficial, ~65-star Go
  reimplementation of the Yjs CRDT algorithm) is bidirectionally wire-compatible with the real `yjs`
  package via a throwaway spike before committing to it — a Go-produced update decodes correctly in JS
  `yjs`, and a JS-produced update decodes correctly in `y-crdt`. Chose `coder/websocket` over
  `gorilla/websocket` (archived since 2022) and `lestrrat-go/jwx` (the closest Go equivalent to `jose`) for
  JWKS/JWT verification.
- Ported the room registry, RBAC enforcement (`rbac.mjs`/`membership.mjs`), rate limiting, frame protocol,
  and crash-guarded CRDT merge into `relay.Core`, parameterized over `Socket`/`Store`/`Authorizer`/
  `RoomAuthorizer` interfaces — zero knowledge of native vs. WASM, matching the injected-dependency shape
  the JS relay already had. Added an explicit mutex and a room-load request-coalescing guard that the JS
  original never needed (single-threaded execution serialized everything for free there; Go's real
  goroutine concurrency does not) — found and fixed via `go test -race`, which caught a genuine data race
  in the native transport adapter's listener registration before it could ship.
- Ported `modules/collab/test/integration/relay.test.mjs`'s full scenario set (RBAC allow/deny, viewer
  read-only, rate-limit breach on both dimensions, malformed-update crash guard, room-name validation
  including a `%2F..%2F` traversal attempt, tag allow-list, role announcement, auth-frame-not-URL-query) to
  Go tests driven over a real `coder/websocket` client — the primary evidence this is a true drop-in
  replacement, not a reimplementation with its own semantics. One of these caught a real bug during the
  port: `http.ServeMux`'s automatic redirect-on-cleaned-path behavior was silently rewriting `//` before
  `relay.Core`'s own room-name validation ever ran, defeating exactly the check the test existed to prove —
  fixed by bypassing `ServeMux` for a bare handler that sees the raw, unmangled request.
- Ported `rbac.test.mjs`, `membership.test.mjs`, `store.test.mjs`, and `auth.test.mjs` (a local
  generate-keypair-serve-JWKS-sign-tokens harness, no real Auth0 tenant needed) to Go — 30 tests total,
  clean under `go test -race -count=4`.
