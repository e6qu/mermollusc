# @m/relay — plan

The real collaborative relay: room registry, RBAC enforcement, rate limiting, frame protocol, and CRDT
merge — written once in Go, run two ways: a native binary for production, and (Milestone 2) compiled to
WebAssembly to run in-process inside the backend-free demo. One implementation, no modes or fallbacks —
the demo runs the same code production does, not a separate reimplementation.

Replaces `modules/collab/server/*.mjs` (the Node/`ws` relay). See `docs/collab-editor-plan.md` for the
collaborative-editor architecture this relay serves; `modules/collab` still owns the browser-side Yjs
document/transport (`@m/collab`'s `src/`), which speaks the same wire protocol to whichever relay is
running.

## Responsibility

- Own the server-authoritative CRDT merge: apply incoming Yjs updates to a per-room `Y.Doc`-equivalent
  and broadcast to peers, using `github.com/skyterra/y-crdt` (verified bidirectionally wire-compatible
  with the real `yjs` npm package the browser side uses — not assumed, tested).
- Enforce RBAC (owner/editor/viewer, tenant isolation) and OIDC token verification before admitting a
  connection or a document edit.
- Persist room snapshots through an injected `Store` (durability seam — in-memory/file today; Postgres/S3
  is a still-open future item, not blocked by this design).
- Rate-limit and validate every inbound frame; survive a malformed CRDT update without crashing the
  process (all rooms, not just the offending connection).

It does **not** know how a connection arrived — `Socket`, `Store`, `Authorizer`, and `RoomAuthorizer` are
all injected interfaces, so the identical `relay` package core has zero knowledge of native vs. WASM,
network vs. in-process. That parameterization is the whole point: it's what makes "the same backend" a
literal fact, not a claim.

## Package layout

```
modules/relay/
├── relay/            the portable core: room registry, RBAC, rate limiting, frame protocol, CRDT merge
├── auth/              Auth0 OIDC / JWKS verification (lestrrat-go/jwx) — a relay.Authorizer
├── store/              concrete Store implementations: Memory, File (native only)
├── cmd/relay-server/  the native production entrypoint: coder/websocket + net/http, same env-var
│                        contract as the JS relay it replaces
└── cmd/relay-wasm/    (Milestone 2) the WASM entrypoint, exposing the core via syscall/js
```

## Design notes

- **Extraction, not reimplementation.** Every behavioral rule (frame tags, close codes, RBAC fail-closed
  defaults, rate-limit shape, room-name grammar, crash-guard semantics) was ported from the JS relay this
  replaces and verified against a Go port of its own integration test suite
  (`modules/collab/test/integration/relay.test.mjs` → `cmd/relay-server/server_test.go`, same scenarios,
  same assertions, driven over a real Go WebSocket client instead of a real `ws` client).
- **Concurrency is the one real behavioral difference from the JS source.** The JS relay could rely on
  single-threaded execution to serialize all room/socket mutations for free; Go connections run on real
  goroutines. `relay.Core` adds an explicit mutex around every mutation of shared state, plus a
  request-coalescing guard in `loadRoom` (two connections racing to first-touch the same brand-new room
  now share one `Doc`, never two divergent ones — unreachable in the single-threaded JS original, real
  under Go's actual parallelism). Verified with `go test -race`, not just by inspection.
- **Async-capable Store.** `Store.Load`/`Store.Save` return errors (not just data), so a future async
  network-backed store (Postgres/S3) drops in without touching `relay.Core` — the still-open "production
  store" item this unblocks rather than blocks.
- **Auth stays config-gated, not demo-gated.** `AuthRequired`/`Authorize`/`AuthorizeRoom` are the same
  three seams in every deployment; the demo runs zero-auth for the same reason local dev does today (no
  Auth0 domain/audience configured), not because of a special-cased "am I the demo" branch anywhere.

## Roadmap

**Milestone 1 (this PR): native parity.** The Go relay is a verified drop-in replacement for the Node one
in production — same wire protocol, same RBAC/auth/store contracts, same close-code semantics, proven
against both a ported version of the JS relay's own test suite and (before merge) the full existing
`app/playground` Playwright e2e suite unchanged.

**Milestone 2 (separate PR): WASM + demo.** `cmd/relay-wasm` + `syscall/js` adapters exposing the exact
same `relay.Core`; the backend-free Pages demo runs it in-process instead of skipping the relay entirely.
Open unknowns going in: the exact `syscall/js` call shape for the demo's in-process socket pairing, and
`vite-plugin-wasm`'s GOROOT-relative build requirements in CI.
