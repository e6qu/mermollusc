# @m/relay — work log

- 2026-07-12 split the global lock to kill cross-room head-of-line blocking. The heavy CRDT work
  (`ApplyUpdate` on every edit, `EncodeStateAsUpdate` on save/broadcast/admission — payloads up to 4 MiB)
  ran under the process-wide `Core.mu`, so one room's large update stalled admissions/broadcasts/saves for
  every OTHER room. Added a per-room `room.docMu` that guards only the CRDT document contents; `Core.mu` now
  guards only the cheap registry + membership/metadata (rooms map, sockets, seeder, pending, saveTimer). Lock
  order is docMu → Core.mu, needed in exactly two spots (the seed-grant decision and `dropSocket`, which both
  consult doc emptiness): docMu is held across the tiny `Core.mu` section so the doc's emptiness is frozen
  while the one-seeder-per-empty-room decision is made — no path takes the locks in the reverse order, so
  they can't deadlock. The existing churn/seed `-race` tests (40 goroutines editing while joining/leaving)
  exercise both two-lock paths and the apply path; they pass at `-count=30`, proving the no-fork / one-seeder
  invariants survived the split.

- 2026-07-12 security-scan follow-ups (lower-severity, from the same scan). (1) `File.Save` shared a fixed
  `<room>.tmp` path, so a fired debounce racing a last-leave/shutdown flush for the SAME room both wrote it
  then renamed — a torn file or a rename ENOENT (a lost/degraded snapshot). Now a per-save unique temp via
  `os.CreateTemp` (0644 preserved, cleaned up on failure); a `-race` concurrency test (24 writers, equal-
  length distinct snapshots) proves the survivor is one complete write. (2) Malformed DOC-update logging was
  unthrottled; routed through the per-connection `throttledLog` like the sibling drop-logs (the frame is
  still dropped — fail-loud — just not spammed). Assessed and LEFT: the origin scheme/port allowance (no
  reliable request-scheme signal behind a TLS proxy; the `ALLOWED_ORIGINS` allowlist is the real control) —
  see DO_NEXT. Still open: splitting the global `Core.mu` (a deliberate, careful-change deferral).

- 2026-07-12 harden unauthenticated connections (DoS) — from a security scan. (1) The pre-auth buffer was
  capped by frame COUNT (`maxPendingFrames = 64`) but each frame is up to `maxFrameBytes` (4 MiB), so one
  unauthenticated peer could pin ~256 MiB before ever sending a token; it's now bounded by TOTAL BYTES
  (`maxPendingBytes = 8 MiB`, tracked in `conn.pendingBytes`). (2) A connection that opened but never
  authenticated lived forever (goroutines + socket slot); a `defaultAuthHandshakeTimeout` (10s, injectable
  via `Options.AuthHandshakeTimeout`; negative disables it for tests) now reaps it, with `admit` guarding
  against the reaper racing the open transition. (3) The `http.Server` gained `ReadHeaderTimeout` (10s,
  slowloris on the upgrade request) and `IdleTimeout` (120s, un-upgraded keep-alives). Two `-race` tests in
  `core_test.go`. Remaining scan findings (global-lock HOL blocking, save `.tmp` race, origin scheme/port,
  malformed-frame log spam) are written up in `DO_NEXT.md`.

- 2026-07-10 review sweep — ten found+fixed bugs (full details in `BUGS.md`): raised the inbound frame
  cap to 4MiB (`SetReadLimit`; the 32KiB default 1009-closed big DOC snapshots); `Store.Load` failures
  now fail the admission instead of seeding an empty room over a good snapshot; fixed the
  last-leave/first-join registry race (pending-admission counter + flush-before-forget + re-checked
  delete) that could fork a doc; put a mutex in the rate bucket (data race between the auth-off pending
  replay and live reads); replaced synchronous sequential broadcast with bounded per-peer outbound
  queues (a slow consumer is closed loudly, senders never stall); `envInt` fails loudly on a malformed
  `PORT`; shutdown drains live connections before the final flush (hijacked conns are invisible to
  `http.Server.Shutdown`); the WASM `jsSocket.Close` now drives the real teardown and the
  `mermolluscRelayConnect` contract gained `onClosed(code, reason)`; replaced `InsecureSkipVerify` with
  an explicit Origin policy (loopback/same-host/`ALLOWED_ORIGINS`, 403 otherwise); pinned JWT
  verification to RS256 by filtering the JWKS. Repaired the red WASM admission test (the seed-grant
  CONTROL frame) and wired `make test-wasm` into `test`/`check` so it can't rot unrun again. New tests:
  core churn/replay races (run under `-race`; the replay test was verified to fail with the bucket mutex
  removed), load-failure admission, origin policy (4), large-frame relay, slow-consumer teardown, WASM
  rejection teardown, RS512-rejection. Corrected these docs where they had drifted from the code: the
  `loadRoom` guard was described as "request-coalescing via `pendingLoads`" (no such symbol; it is
  double-checked locking), exact test counts were stale, and the wasm gzip size is now stated once from
  a fresh measurement (≈1.4MB). Raised `COV_MIN` 69 → 73 (coverage climbed with the new tests).
- Relay-owned seed coordination (fixes the last open bug in the repo — the collab seed race): the
  admission path grants the reserved "seed" CONTROL message to exactly one connection per EMPTY room
  (`room.seeder`, decided under `c.mu` so concurrent admissions can never both win; emptiness =
  `GetStateVector(doc.Store)` empty). If the holder disconnects while the room is still empty, the
  grant moves to a surviving peer (`dropSocket`, shared by the close and failed-admission paths) — a
  seeder that dies before seeding must not leave the room permanently unseedable. Three admission
  tests cover exactly-one-of-two, no-grant-with-content, and re-grant-to-survivor; a fourth harness
  lesson recorded here: coder/websocket closes the connection when a Read context is canceled, so
  frame assertions must be bounded by the protocol (read up to the admission's DOC frame), never by a
  read-window timeout.
- `make cov` now enforces a total-coverage floor (69%): `-coverpkg=./...` credits cross-package coverage
  (relay.Core is exercised mostly through cmd/relay-server's integration harness, which plain
  per-package profiles don't count — they misleadingly reported relay/ at 16%), and an awk gate exits
  non-zero below the ratchet, matching the TS modules' vitest convention. Runs in the pre-push gate.
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
  the JS relay already had. Added an explicit mutex and a double-checked-locking first-touch guard in
  `loadRoom` that the JS original never needed (single-threaded execution serialized everything for free
  there; Go's real goroutine concurrency does not) — found and fixed via `go test -race`, which caught a
  genuine data race in the native transport adapter's listener registration before it could ship.
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
