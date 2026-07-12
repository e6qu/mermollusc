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

Security-scan follow-ups (2026-07-12; the pre-auth memory, handshake-timeout, save-`.tmp`-race and
malformed-frame-log items from that scan are fixed — see WHAT_WE_DID / BUGS):
- **Global `Core.mu` held across CRDT apply/encode → cross-room head-of-line blocking.** `applyUpdateGuarded`
  / `EncodeStateAsUpdate` run under the process-wide `c.mu` on attacker-supplied payloads up to 4 MiB, so
  one room's large update stalls admissions/broadcasts/saves for every other room. Move to per-room locking
  so CRDT work doesn't serialize the whole server. (Deferred deliberately: the module comment calls the
  single mutex a correctness requirement of the Go port, so splitting it needs care around the room registry
  / seed-grant / dropSocket invariants — a focused change, not a drive-by.)
- **Origin policy ignores scheme (and port) on the same host** (`server.go` same-host branch). Assessed and
  LEFT: the request scheme can't be determined reliably behind a TLS-terminating proxy (`r.TLS` is nil), so
  enforcing scheme would reject legitimate same-host `https` origins and break real deployments — the scan
  itself flagged this as a design tradeoff, not a clear bug, and the explicit `ALLOWED_ORIGINS` allowlist is
  the real control. Revisit only with a reliable scheme signal (e.g. a trusted `X-Forwarded-Proto` contract).
