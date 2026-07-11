# @m/relay — status

**State: Milestones 1 and 2 done.** The Go relay is the real, only relay — `make collab-server` and
`app/playground`'s Playwright `webServer` run the native binary; the backend-free demo runs the same core
compiled to WebAssembly, in-process, instead of skipping the relay. The superseded
`modules/collab/server/*.mjs` files are gone.

- **Core (`relay/`):** `Core.Connect(socket, req)` — the full admission state machine (auth, room
  resolution, RBAC, snapshot load, CONTROL role + one-per-empty-room "seed" grant + initial DOC frame,
  pending-frame replay), frame handling
  (tag allow-list, rate limiting, crash-guarded `ApplyUpdate`, debounced save, broadcast), and room
  registry (`FlushAll` for clean shutdown) — parameterized over `Socket`/`Store`/`Authorizer`/
  `RoomAuthorizer`, with zero knowledge of native vs. WASM. `y-crdt` verified bidirectionally
  byte-compatible with the real `yjs` package (a Go update decodes correctly in JS `yjs`; a JS update
  decodes correctly in `y-crdt` — tested, not assumed).
- **RBAC (`relay/rbac.go`, `relay/membership.go`):** `NewClaimsRoleResolver` (token-claims + tenant
  isolation, fail-closed by default) and `NewMembershipRoleResolver`/`DecodeMemberships`/
  `LoadMembershipRoleResolver` (static room/member role source) — both ported 1:1 from `rbac.mjs`/
  `membership.mjs`, including the deliberate asymmetry (an unauthenticated user gets `RoleEditor`
  automatically under claims-based RBAC, but only `defaultRole` under membership-based RBAC).
- **Auth (`auth/`):** `NewVerifier`/`NewAuth0Verifier` — RS256 JWT verification against an
  auto-refreshing remote JWKS via `lestrrat-go/jwx`, checked end-to-end against a local JWKS harness
  (generate an RSA keypair, serve it, sign tokens, verify) — no real Auth0 tenant needed for tests. The
  accepted algorithm is pinned: the looked-up JWKS is filtered to keys explicitly declared RS256 before
  verification, so a new JWKS entry can never widen the accepted-algorithm set. Never imported by the
  WASM build (the demo is zero-auth, same config-driven reason local dev is).
- **Store (`store/`):** `Memory` and `File` (atomic tmp-then-rename writes, URL-escaped room-id
  filenames) — ported 1:1 from `store.mjs`, native-only (the WASM build's store is a JS-callback adapter
  instead, backed by the browser's real IndexedDB — see below).
- **Native entrypoint (`cmd/relay-server/`):** `coder/websocket` (actively maintained; `gorilla/websocket`
  is archived) over `net/http`, same env-var contract as the old `relay.mjs` CLI (`PORT`/`PERSIST_DIR`/
  `AUTH0_DOMAIN`/`AUTH0_AUDIENCE`/`MEMBERSHIP_FILE`, plus `ALLOWED_ORIGINS` for the Origin allowlist; a
  malformed `PORT` exits loudly instead of silently defaulting). SIGINT/SIGTERM shutdown drains (closes +
  waits for) every live WebSocket connection — each room flushes via its normal last-socket-out path —
  before the final `FlushAll`, so edits inside the save-debounce window survive a clean stop. An explicit
  Origin policy gates the upgrade (no-Origin/loopback/same-hostname/allowlisted pass; everything else is
  a logged 403 — the old `InsecureSkipVerify` let any website drive a local relay). Inbound frames are
  capped at 4MiB (`maxFrameBytes`, matching the rate limiter's byte bucket; the library default of 32KiB
  killed large DOC snapshots), and each peer gets a bounded outbound queue drained by its own writer
  goroutine — a slow consumer is closed loudly instead of stalling the room's broadcast. Deliberately
  bypasses `http.ServeMux` — its automatic redirect-on-cleaned-path behavior silently rewrites malformed
  room paths (repeated slashes, `.`/`..` segments) before `relay.Core`'s own validation ever sees them; a
  bare `http.HandlerFunc` sees the raw, unmangled request. This is what `make collab-server` and the
  Playwright `webServer` (`app/playground/playwright.config.ts`) run.
- **WASM entrypoint (`cmd/relay-wasm/`, `//go:build js && wasm`):** exposes `relay.Core` via four
  `js.Global()` functions (`mermolluscRelayConnect`/`Receive`/`Close`/`Flush`) to
  `modules/collab/src/shell/wasm-relay.ts`. `mermolluscRelayConnect` takes an `onClosed(code, reason)`
  callback and `jsSocket.Close` drives the full teardown (registry removal, JS notification, the core's
  close listener), so a relay-side rejection reaches the client instead of leaking a goroutine. A
  JS-callback `Store` bridges `Load`/`Save` to the browser's real `IndexedDB` (via
  `createIndexedDbRoomStore`) using the same async-bridging pattern Go's own `net/http` uses for
  `GOOS=js GOARCH=wasm` (`awaitPromise`, modeled on `roundtrip_js.go`). Compiled size: 5.3MB raw /
  **≈1.4MB gzipped** (measured on the real `cmd/relay-wasm` build), lazy-loaded only behind `?collab`.
- **Verified:** run `make test` — it is the gate and runs BOTH the native suite (`relay/`, `auth/`,
  `store/`, `cmd/relay-server/`) and the `GOOS=js GOARCH=wasm` suite (`cmd/relay-wasm/`, via Go's own
  Node-based `go_js_wasm_exec` runner — genuine wasm execution, no browser needed; previously the build
  tag silently excluded it from every native run and it rotted red). The suite is the full port of the JS
  relay's own tests plus admission/broadcast/store/flush coverage for the WASM entrypoint, origin-policy
  and slow-consumer coverage for the native entrypoint, and core-level churn/replay races. Clean under
  `go test -race ./...` (native; the race detector isn't available for the wasm target). See `BUGS.md`
  for the real bugs these tests caught — both during the original port and in the 2026-07-10 review
  sweep.
- **End-to-end proof:** the *full* existing `app/playground` Playwright suite (251 specs, unchanged) passed
  against the native relay; `e2e-pages/backend-free-collab.spec.ts` (rewritten for Milestone 2) proves the
  WASM relay sets a real role badge from a genuine CONTROL frame, an override survives reload via the
  relay's own debounced IndexedDB save, and zero real `WebSocket`s are ever opened.
- **Demo CSP:** WebAssembly compilation requires an explicit CSP allowance
  (`'wasm-unsafe-eval'` — CSP Level 3, permits only WASM compilation, never `eval()`/`Function()`).
  `tools/build-pages.mjs` patches this into the *built* demo's `index.html` only; `app/playground/index.html`
  (every other build/deployment) keeps the stricter policy.

Coverage: `make cov` enforces a total floor (`COV_MIN` in the Makefile, `-coverpkg=./...` cross-package
counting), ratcheted just below current coverage — same convention as the TS modules' vitest thresholds.
