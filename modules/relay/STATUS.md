# @m/relay — status

**State: Milestones 1 and 2 done.** The Go relay is the real, only relay — `make collab-server` and
`app/playground`'s Playwright `webServer` run the native binary; the backend-free demo runs the same core
compiled to WebAssembly, in-process, instead of skipping the relay. The superseded
`modules/collab/server/*.mjs` files are gone.

- **Core (`relay/`):** `Core.Connect(socket, req)` — the full admission state machine (auth, room
  resolution, RBAC, snapshot load, CONTROL + initial DOC frame, pending-frame replay), frame handling
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
  (generate an RSA keypair, serve it, sign tokens, verify) — no real Auth0 tenant needed for tests. Never
  imported by the WASM build (the demo is zero-auth, same config-driven reason local dev is).
- **Store (`store/`):** `Memory` and `File` (atomic tmp-then-rename writes, URL-escaped room-id
  filenames) — ported 1:1 from `store.mjs`, native-only (the WASM build's store is a JS-callback adapter
  instead, backed by the browser's real IndexedDB — see below).
- **Native entrypoint (`cmd/relay-server/`):** `coder/websocket` (actively maintained; `gorilla/websocket`
  is archived) over `net/http`, same env-var contract as the old `relay.mjs` CLI (`PORT`/`PERSIST_DIR`/
  `AUTH0_DOMAIN`/`AUTH0_AUDIENCE`/`MEMBERSHIP_FILE`), same SIGINT/SIGTERM flush-then-exit shutdown.
  Deliberately bypasses `http.ServeMux` — its automatic redirect-on-cleaned-path behavior silently
  rewrites malformed room paths (repeated slashes, `.`/`..` segments) before `relay.Core`'s own validation
  ever sees them; a bare `http.HandlerFunc` sees the raw, unmangled request. This is what
  `make collab-server` and the Playwright `webServer` (`app/playground/playwright.config.ts`) run.
- **WASM entrypoint (`cmd/relay-wasm/`, `//go:build js && wasm`):** exposes `relay.Core` via four
  `js.Global()` functions (`mermolluscRelayConnect`/`Receive`/`Close`/`Flush`) to
  `modules/collab/src/shell/wasm-relay.ts`. A JS-callback `Store` bridges `Load`/`Save` to the browser's
  real `IndexedDB` (via `createIndexedDbRoomStore`) using the same async-bridging pattern Go's own
  `net/http` uses for `GOOS=js GOARCH=wasm` (`awaitPromise`, modeled on `roundtrip_js.go`). Compiled size:
  5.3MB raw / **1.45MB gzipped**, lazy-loaded only behind `?collab`.
- **Verified:** 34 native tests (`relay/`, `auth/`, `store/`, `cmd/relay-server/`) + 4 WASM-target tests
  (`cmd/relay-wasm/`, run via Go's own `go_js_wasm_exec` — genuine `GOOS=js GOARCH=wasm` execution, not a
  native-side approximation) — the full port of the JS relay's own test suites, plus admission/broadcast/
  store/flush coverage for the WASM entrypoint specifically. Clean under `go test -race` (native) and
  repeated `go test` runs (WASM — the race detector isn't available for that target). Caught two real bugs
  before either milestone shipped: a data race in the native transport adapter's listener registration,
  and (Milestone 2) `http.ServeMux`'s path-cleaning silently defeating room-name validation — see
  `BUGS.md`.
- **End-to-end proof:** the *full* existing `app/playground` Playwright suite (251 specs, unchanged) passed
  against the native relay; `e2e-pages/backend-free-collab.spec.ts` (rewritten for Milestone 2) proves the
  WASM relay sets a real role badge from a genuine CONTROL frame, an override survives reload via the
  relay's own debounced IndexedDB save, and zero real `WebSocket`s are ever opened.
- **Demo CSP:** WebAssembly compilation requires an explicit CSP allowance
  (`'wasm-unsafe-eval'` — CSP Level 3, permits only WASM compilation, never `eval()`/`Function()`).
  `tools/build-pages.mjs` patches this into the *built* demo's `index.html` only; `app/playground/index.html`
  (every other build/deployment) keeps the stricter policy.

Coverage: no `go test -cover` threshold gate defined yet (unlike the TS modules' vitest ratchets) — still
worth adding, not blocking.
