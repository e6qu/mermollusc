# @m/relay — work log

- Milestone 2: compiled the same relay core to WebAssembly (`cmd/relay-wasm`, `//go:build js && wasm`) so
  the backend-free demo runs the real relay in-process instead of skipping it. Verified the async
  JS-bridging pattern (calling a `Promise`-returning JS function — here, the JS-callback `Store` wrapping
  the browser's real IndexedDB — from a Go goroutine without deadlocking the single-threaded WASM runtime)
  against Go's own `net/http` standard library source (`roundtrip_js.go`) before writing it, rather than
  guessing at the pattern. Confirmed `relay.Core` (including `y-crdt`) already builds and passes its
  existing test suite under `GOOS=js GOARCH=wasm` via Go's own `go_js_wasm_exec` runner before committing
  to the design. Wrote `modules/collab/src/shell/wasm-relay.ts` (the TypeScript side of the seam) with an
  injectable `WasmRelayGlobal` so the wiring logic is unit-testable without a real browser; the actual
  loading mechanics (script injection, fetch, WebAssembly instantiation) are covered by the Playwright
  e2e suite instead, since there's no meaningful way to unit-test real browser API orchestration in Node.
  Corrected a wrong assumption from Milestone 1's plan: `vite-plugin-wasm` turned out to be a
  `wasm-pack`/Rust-oriented ESM loader with no Go support at all — verified via its actual README rather
  than trusting the earlier belief. Go's WASM output needs no bundler plugin at all, just the standard
  `wasm_exec.js` + `fetch` + `instantiateStreaming` pattern.
- Two real, unrelated blockers surfaced only by actually running the built demo in a real browser (neither
  was caught by any unit/integration test, Go-side or TS-side): `relay.wasm`/`wasm_exec.js` need to be
  resolved under Vite's `BASE_URL`, not the site root, since the Pages demo isn't hosted at the domain
  root; and browsers refuse to compile WebAssembly at all under `script-src 'self'` without an explicit
  CSP allowance. Fixed the CSP gap narrowly: `tools/build-pages.mjs` patches `'wasm-unsafe-eval'` (CSP
  Level 3 — permits only WASM compilation, never `eval()`/`Function()` string execution, unlike the much
  broader `'unsafe-eval'`) into the *built* demo's `index.html` only; every other build/deployment of the
  app keeps the unmodified, stricter policy from `app/playground/index.html`.
- Rewired `app/playground/src/main.ts`'s backend-free branch off the old "skip transport, hand-save to
  IndexedDB on every update" shortcut onto `connectWasmRelay(...)` feeding the *same*
  `connectTransport(...)` call the real-relay branch already uses — persistence now happens inside the
  relay core itself (a genuine 400ms debounced save, matching production, not an ad hoc per-update write).
  Rewrote `e2e-pages/backend-free-collab.spec.ts` to prove real relay/RBAC involvement (a role badge from
  a genuine CONTROL frame) while keeping the zero-real-`WebSocket` invariant; the full existing
  `app/playground` e2e suite (251 specs, unchanged) still passes, confirming zero regression to the
  real-relay production path.
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
