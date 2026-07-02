# @m/relay — do next

- **Swap `make collab-server` and the Playwright `webServer` entry to this binary.** Update root
  `Makefile`'s `collab-server` target and `app/playground/playwright.config.ts`'s `webServer` array to run
  `go run ./cmd/relay-server` (or a built binary) instead of `node modules/collab/server/relay.mjs`, same
  `PORT`/env contract. Then run the FULL existing `app/playground` e2e suite (`make e2e-ui`) unchanged
  against it — this is the real proof of drop-in parity, since those specs exercise the relay end-to-end
  without knowing its implementation language.
- **Remove the superseded `.mjs` server files** (`modules/collab/server/relay.mjs`/`rbac.mjs`/`auth.mjs`/
  `membership.mjs`/`store.mjs` and their integration tests) once the above is green — this module replaces
  them, it doesn't run alongside them.
- **Milestone 2 — WASM + demo integration**, a separate PR once Milestone 1 is merged and stable:
  - `cmd/relay-wasm` entrypoint exposing `relay.Core` via `syscall/js` — a small set of JS-callable
    functions where the actual socket/store I/O are JS-provided callbacks (real in-process socket wiring +
    real IndexedDB, both belong in TypeScript, not reimplemented in Go). `syscall/js` deadlocks if a Go
    call blocks on an async JS API (fetch, IndexedDB) without a goroutine — the callback design sidesteps
    this by construction, not by care taken at each call site.
  - `vite-plugin-wasm` wired into `app/playground`'s Vite config for loading the compiled `.wasm` +
    `wasm_exec.js`; `tools/build-pages.mjs` updated to include the artifact, lazy-loaded only behind
    `?collab` (it's ~1.2MB gzipped — real weight, not appropriate to load on every page view).
  - Rewire `app/playground/src/main.ts`'s backend-free branch off today's IndexedDB-only shortcut onto the
    real in-process relay; update `e2e-pages/backend-free-collab.spec.ts` to prove real relay/RBAC
    involvement (not just persistence) while keeping the zero-real-`WebSocket` invariant.
- **No coverage gate yet.** The TS modules ratchet `vitest` coverage thresholds (`make cov`); this module's
  `make cov` just runs `go test -cover` with no enforced floor. Worth adding once Milestone 1's shape has
  settled — don't add a ratchet against code that's about to change shape in Milestone 2.
- **Production store** (Postgres update-log + S3 snapshots, per `docs/collab-editor-plan.md` §10.3) is
  unblocked by this port's async-capable `Store` interface but not implemented here — still future work,
  same as it was for the JS relay.
