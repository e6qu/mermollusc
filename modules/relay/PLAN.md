# @m/relay — plan

The real collaborative relay: room registry, RBAC enforcement, rate limiting, frame protocol, and CRDT
merge — written once in Go, run two ways: a native binary for production, and compiled to WebAssembly to
run in-process inside the backend-free demo. One implementation, no modes or fallbacks — the demo runs the
same code production does, not a separate reimplementation.

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
└── cmd/relay-wasm/    the WASM entrypoint (//go:build js && wasm) — exposes the core via syscall/js to
                         modules/collab/src/shell/wasm-relay.ts, driving the backend-free demo in-process
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
  `cmd/relay-wasm` never even imports the `auth` package, so the compiled binary carries no unused
  JWKS-fetch code for a context that will never use it.
- **The `syscall/js` async-bridging pattern isn't novel.** Calling a JS `Promise`-returning function (the
  WASM build's JS-callback `Store`, backed by the browser's real IndexedDB) from a Go goroutine deadlocks
  the single-threaded WASM runtime if done synchronously inside a `js.FuncOf` callback. `awaitPromise` in
  `cmd/relay-wasm/main.go` is the same success/failure-callback-plus-buffered-channel pattern Go's own
  `net/http` uses for `GOOS=js GOARCH=wasm` (`roundtrip_js.go`) — every exported function whose call chain
  can reach the Store runs in its own goroutine, never inline in the handler.
- **No bundler plugin for loading the WASM module.** Go's WASM output isn't an ES module (unlike
  `wasm-pack`'s Rust output, which is what tools like `vite-plugin-wasm` target) — it's a `.wasm` binary
  paired with `wasm_exec.js` (a plain script Go itself ships). `modules/collab/src/shell/wasm-relay.ts`
  loads it with the standard `fetch` + `WebAssembly.instantiateStreaming` pattern, falling back to the
  buffered `WebAssembly.instantiate` path if a static file server doesn't send the right
  `Content-Type: application/wasm` header.
- **The demo build ships a slightly relaxed CSP, scoped to only the demo.** Browsers refuse to compile
  WebAssembly under `script-src 'self'` alone — `'wasm-unsafe-eval'` (CSP Level 3; permits only WASM
  compilation, never `eval()`/`Function()` string execution) is patched into the *built* demo's
  `index.html` by `tools/build-pages.mjs`, not into `app/playground/index.html` — every other
  build/deployment of the app keeps the stricter policy unchanged.

## Roadmap

**Milestone 1 (done): native parity.** The Go relay is a verified drop-in replacement for the Node one in
production — same wire protocol, same RBAC/auth/store contracts, same close-code semantics, proven against
both a ported version of the JS relay's own test suite and the full existing `app/playground` Playwright
e2e suite unchanged.

**Milestone 2 (done): WASM + demo.** `cmd/relay-wasm` + `syscall/js` adapters exposing the exact same
`relay.Core`, driven by `modules/collab/src/shell/wasm-relay.ts`; the backend-free Pages demo runs the
real relay in-process instead of skipping it. Verified end-to-end: `app/playground/e2e-pages/
backend-free-collab.spec.ts` proves a genuine CONTROL frame from the WASM relay's own RBAC resolver sets
the role badge, an override survives reload via the relay's own debounced save into IndexedDB, and zero
real `WebSocket`s are ever opened. Compiled `relay.wasm`: 5.3MB raw / **1.45MB gzipped** (measured on the
real `cmd/relay-wasm` build, not the earlier size spike) — lazy-loaded only behind `?collab`, never on a
normal page load.

**Next:** the production `RoomStore` (Postgres/S3/Redis) — see `DO_NEXT.md`.
