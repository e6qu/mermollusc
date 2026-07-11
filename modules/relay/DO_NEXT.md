# @m/relay — do next

- *(done)* **Swap `make collab-server` and the Playwright `webServer` entry to this binary.** Root
  `Makefile`'s `collab-server` target and `app/playground/playwright.config.ts`'s `webServer` array run the
  Go binary; the full existing `app/playground` e2e suite (251 specs, unchanged) passed against it.
- *(done)* **Remove the superseded `.mjs` server files** — `modules/collab/server/*.mjs` and their
  integration tests are gone.
- *(done)* **Milestone 2 — WASM + demo integration.** `cmd/relay-wasm` exposes `relay.Core` via
  `syscall/js` to `modules/collab/src/shell/wasm-relay.ts`; the backend-free Pages demo runs the real relay
  in-process. `tools/build-pages.mjs` compiles and stages the artifacts (lazy-loaded, demo-build only,
  ≈1.4MB gzipped measured on the actual build) and patches the built demo's CSP with the narrow
  `'wasm-unsafe-eval'` allowance WASM compilation requires. Verified end-to-end via a rewritten
  `e2e-pages/backend-free-collab.spec.ts`.
- *(done)* **Coverage gate.** `make cov` enforces a 69% total floor (`COV_MIN` in the Makefile) using
  `-coverpkg=./...` cross-package counting, and runs in the repo's pre-push gate with the TS modules.
- **Production store** (Postgres update-log + S3 snapshots, per `docs/collab-editor-plan.md` §10.3) is
  unblocked by this port's async-capable `Store` interface but not implemented here — still future work,
  same as it was for the JS relay.
- **Minor redundancy, not a bug:** the backend-free demo's `createCollabSession` still pre-seeds
  `initialUpdate` from `localCollabStore` client-side (`app/playground/src/main.ts`'s
  `useStoredLocalCollabRoom` logic) *in addition to* the WASM relay's own admission flow sending the same
  room state as an initial DOC frame. Applying the same Yjs update twice is harmless (CRDT idempotency),
  but the client-side pre-seed is no longer necessary now that the relay always provides initial state —
  matching the real-relay branch, which never pre-seeds and relies solely on the connection's own sync.
  Worth unifying in a future pass; out of scope for this PR (the pre-seed logic also interacts with
  share-link/example-URL precedence rules that need care to touch).
