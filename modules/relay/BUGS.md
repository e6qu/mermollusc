# @m/relay — bugs

No known open bugs.

Resolved (caught during the Go port/WASM milestones, fixed before shipping — flagged here because they're
exactly the kind of thing worth remembering when touching this code again):

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
- **(Milestone 2) `relay.wasm`/`wasm_exec.js` resolved against the site root instead of the demo's base
  path.** The Pages demo isn't hosted at the domain root (`/mermollusc/demo/`, not `/`); hardcoded
  `/relay.wasm` URLs 404'd. Neither Go-side nor TypeScript-side unit tests could have caught this — it's a
  deployment-path concern. Fixed by resolving both URLs against Vite's `import.meta.env.BASE_URL` in
  `app/playground/src/main.ts`, and only found by actually running the built demo in a real browser.
- **(Milestone 2) WebAssembly compilation was blocked by the app's Content-Security-Policy.** Browsers
  refuse `WebAssembly.instantiate()`/`instantiateStreaming()` under `script-src 'self'` alone — confirmed
  via the actual CSP violation, not assumed. Fixed narrowly: `tools/build-pages.mjs` patches
  `'wasm-unsafe-eval'` (CSP Level 3 — permits *only* WASM compilation, never `eval()`/`Function()` string
  execution) into the *built* demo's `index.html` only; `app/playground/index.html` (every other
  build/deployment of the app) keeps the unmodified, stricter policy.
