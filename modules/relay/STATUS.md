# @m/relay — status

**State: Milestone 1 in progress.** Native Go relay is functionally complete and verified against a ported
copy of the JS relay's own integration test suite; not yet swapped in as the actual `make collab-server` /
Playwright `webServer` backend, and the superseded `modules/collab/server/*.mjs` files haven't been removed
yet — both are the remaining Milestone 1 steps.

- **Core (`relay/`):** `Core.Connect(socket, req)` — the full admission state machine (auth, room
  resolution, RBAC, snapshot load, CONTROL + initial DOC frame, pending-frame replay), frame handling
  (tag allow-list, rate limiting, crash-guarded `ApplyUpdate`, debounced save, broadcast), and room
  registry (`FlushAll` for clean shutdown) — parameterized over `Socket`/`Store`/`Authorizer`/
  `RoomAuthorizer`. `y-crdt` verified bidirectionally byte-compatible with the real `yjs` package (a Go
  update decodes correctly in JS `yjs`; a JS update decodes correctly in `y-crdt` — tested, not assumed).
- **RBAC (`relay/rbac.go`, `relay/membership.go`):** `NewClaimsRoleResolver` (token-claims + tenant
  isolation, fail-closed by default) and `NewMembershipRoleResolver`/`DecodeMemberships`/
  `LoadMembershipRoleResolver` (static room/member role source) — both ported 1:1 from `rbac.mjs`/
  `membership.mjs`, including the deliberate asymmetry (an unauthenticated user gets `RoleEditor`
  automatically under claims-based RBAC, but only `defaultRole` under membership-based RBAC).
- **Auth (`auth/`):** `NewVerifier`/`NewAuth0Verifier` — RS256 JWT verification against an
  auto-refreshing remote JWKS via `lestrrat-go/jwx`, checked end-to-end against a local JWKS harness
  (generate an RSA keypair, serve it, sign tokens, verify) — no real Auth0 tenant needed for tests, same
  approach the JS `auth.test.mjs` uses.
- **Store (`store/`):** `Memory` and `File` (atomic tmp-then-rename writes, URL-escaped room-id
  filenames) — ported 1:1 from `store.mjs`, same copy-on-save/load contract, same restart-survival
  guarantee (a fresh `File` instance over the same directory loads what a prior one saved).
- **Native entrypoint (`cmd/relay-server/`):** `coder/websocket` (actively maintained; `gorilla/websocket`
  is archived) over `net/http`, same env-var contract as `relay.mjs`'s CLI (`PORT`/`PERSIST_DIR`/
  `AUTH0_DOMAIN`/`AUTH0_AUDIENCE`/`MEMBERSHIP_FILE`), same SIGINT/SIGTERM flush-then-exit shutdown.
  Deliberately bypasses `http.ServeMux` — its automatic redirect-on-cleaned-path behavior silently
  rewrites malformed room paths (repeated slashes, `.`/`..` segments) before `relay.Core`'s own validation
  ever sees them, defeating the exact checks those room-name tests exist to prove; a bare `http.HandlerFunc`
  sees the raw, unmangled request.
- **Verified:** 30 tests green across `relay/`, `auth/`, `store/`, `cmd/relay-server/` — the full port of
  `relay.test.mjs`'s RBAC/rate-limit/crash-guard/room-name/tag-allow-list scenarios (driven over a real Go
  WebSocket client), `rbac.test.mjs`, `membership.test.mjs`, `store.test.mjs`, and `auth.test.mjs`'s local
  JWKS harness. Clean under `go test -race` (repeated runs) — this caught and fixed a genuine data race in
  `wsSocket` (listener registration racing against the read loop's dispatch) and confirmed the room-load
  request-coalescing guard is needed (Go's real concurrency reaches a code path the single-threaded JS
  original never could).
- **Not yet done:** swap `make collab-server` / the Playwright `webServer` entry to this binary and run the
  full `app/playground` e2e suite against it (the real proof of drop-in parity); remove the superseded
  `.mjs` server files; Milestone 2 (WASM + demo) not started.

Coverage: no `go test -cover` threshold gate defined yet (unlike the TS modules' vitest ratchets) — worth
adding once Milestone 1's shape has settled, not before.
