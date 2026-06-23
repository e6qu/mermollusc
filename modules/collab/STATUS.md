# @m/collab — status

**State:** Phase 1 feature-complete; **Phase 2 in progress** — durable persistence, Auth0 OIDC
verification, **and rooms + RBAC** at the relay. CRDT document, WebSocket transport, live source
binding, presence, restart-survival, token-verified connections, and server-enforced per-document
roles + tenant isolation. Remaining Phase 2: the browser login + the production store. The app always
runs single-user with no relay/persistence/auth.

- **What works:** `createCollabSession` wraps a `Y.Doc` (source `Y.Text` + overrides/groups `Y.Map`s).
  Its `overlay` implements the `OverlayDoc` port (move/resize/group/ungroup/lock/label/prune/replace/
  replaceOverrides/clear, undo/redo via `Y.UndoManager`, persist via injected `save`). Source channel:
  `source`/`setSource`/`spliceSource` + `onSourceChange`. Binary sync: `state`/`applyUpdate`/`onUpdate`.
- **Transport:** `connectTransport(session, socket)` binds the binary-sync seam to any `CollabSocket`;
  `webSocketTransport(url)`/`connectWebSocket(session, url)` use the platform `WebSocket`.
- **Server (`server/relay.mjs`):** a server-authoritative relay (rooms by URL path; per-room `Y.Doc`;
  full state on join + broadcast). `make collab-server` runs it. **Optional** — the app runs fully
  single-user without it.
- **Persistence (`server/store.mjs`):** a pluggable `RoomStore` — in-memory default + a file-snapshot
  store (`PERSIST_DIR`). The relay loads a room's snapshot on first join and saves it. **Durability
  guarantee:** an edit is durable once (a) its 400 ms save-debounce timer fires, (b) the room empties
  (last socket closes → flush), OR (c) the relay shuts down cleanly on SIGINT/SIGTERM (`wss.flushAll()`
  flushes every dirty room before exit). An edit still inside the open debounce window when the process
  is **hard-killed** (SIGKILL / crash / power loss) is lost — the file store has no write-ahead log; the
  production Postgres target (an append-only update log + S3 snapshots, same interface) closes that gap.
- **Auth (`server/auth.mjs`):** the `authorize(req)` hook verifies the connection's `?token=` against
  the issuer's JWKS (Auth0; `jose`) — signature + issuer + audience + expiry — and surfaces the user
  (incl. `tenant` from `org_id` and per-room `roles` claims), or rejects (the relay closes 1008,
  buffering frames during the async check). **Env-gated** (`AUTH0_DOMAIN`/`AUTH0_AUDIENCE`); default is
  allow-all, so local dev / e2e stay zero-auth.
- **RBAC (`server/rbac.mjs`):** `authorizeRoom({ user, room })` resolves the role (owner/editor/viewer)
  or null (no access). The default resolver isolates **tenants** (a tenant-bound user reaches only
  rooms namespaced `<tenant>/…`) and reads **per-room roles** from token claims (authoritative when
  present). `createClaimsRoleResolver` now **fails closed** by default (`defaultRole: null`): a verified
  token with no per-room roles claim is **denied**. The relay's run-block computes
  `authEnabled = Boolean(domain && audience)` and passes `defaultRole: authEnabled ? null : "editor"` —
  so an auth-on deployment denies role-less tokens while auth-off dev/e2e still grant editor.
  Unauthenticated users (auth disabled) always get editor. The relay closes 1008 on no access and
  enforces **viewers read-only** (their inbound document frames are dropped, logged throttled; presence
  still relays).
- **Relay hardening:** a **crash guard** wraps `applyUpdate` (a malformed CRDT frame is logged and
  dropped, never an `uncaughtException`); `socket.on("error")` + `wss.on("error")` keep transport faults
  off `uncaughtException`. A **per-socket token-bucket rate limit** on frames/sec AND bytes/sec
  (injectable `rateLimit` knob) closes 1008 on breach, applied to all post-auth frames. A **tag
  allow-list** (`DOC`/`AWARE` only) drops unknown and inbound `CONTROL` frames. The **room name is
  validated once at the boundary** (`<tenant>/<id>` grammar; empty/`.`/`..`/>2-segment names → 1008, no
  normalisation). On **SIGINT/SIGTERM** the run-block flushes every dirty room (`wss.flushAll()`) before
  exit.
- **Reconnecting transport (`src/shell/transport.ts`):** `reconnectingWebSocketTransport(url, deps)` is a
  self-healing `CollabSocket` — on the inner socket's close it mints a **fresh** WebSocket and re-binds
  all listeners (a dead socket's listeners never fire again), retrying with exponential backoff + jitter
  up to a cap; on reopen it re-fires `onOpen` so `connectTransport`'s state exchange re-runs (Yjs merges
  idempotently). The consumer `onClose` fires only when the retry budget is exhausted. It surfaces a
  closed-union `ReconnectStatus` (`reconnecting`/`reconnected`/`disconnected`) for the app, and injects
  `schedule`/`random`/`mkSocket` so the backoff is deterministic under test. `webSocketTransport`/
  `connectWebSocket` are unchanged.
- **Decode-as-Result + status surface (`src/shell/session.ts`):** `materialize` now RETURNS the decode
  `Result` instead of throwing inside the Yjs observer. On a corrupt remote overlay the observer logs
  loudly via a `Logger<CollabEvent>` (`"overlay-decode-rejected"`, threaded through
  `createCollabSession({ logger })`), surfaces a `CollabStatus` (`synced`/`overlay-rejected`) via
  `onStatusChange`, and **keeps last-good** state — a malicious/buggy peer degrades to a warning, never a
  crash or silent desync.
- **Collision-proof group ids:** `groupNodes` mints `g${awareness.clientID}-${seq}` (was `g${seq}` from
  a per-client counter starting at 0), so two collaborators grouping concurrently no longer overwrite
  each other's group in the shared map. No schema change (the decoder accepts `z.string()`; no consumer
  parses the id numerically).
- **Role-aware client:** the relay sends the granted role as a **control frame** (transport tag 2,
  surfaced via `connectWebSocket`'s `onControl`). The app applies it: a viewer's **editor and canvas go
  read-only** (drag/resize/delete/nudge/rename blocked, editing tools dimmed) with a "view only" badge;
  an editor grant restores editing. The server stays the security boundary — this is the matching UX.
- **Source binding:** `sourceBinding()` returns a y-codemirror.next extension that two-way-binds the
  editor to the source `Y.Text` (character-level merge, per-user text undo). The `Y.Text` stays
  encapsulated — only an opaque CodeMirror extension crosses the boundary. Two `?collab` tabs now share
  the diagram **text** live, each re-deriving its diagram locally.
- **Presence:** a y-protocols `Awareness` rides the same transport on a distinct frame. `setLocalUser`
  labels the client (name/colour); the source binding tracks the local cursor into awareness, so remote
  carets/selections render in peers' editors. Ephemeral — relayed, never stored.
- **Verified:** 74 tests green — single-client overlay (incl. `replaceOverrides`) + undo/redo + source +
  the **corrupt-remote-overlay** path (logs `overlay-decode-rejected`, surfaces `overlay-rejected`,
  keeps last-good, no throw) (unit); transport wiring over in-memory paired sockets + a mocked-`WebSocket`
  `webSocketTransport` + presence-frame routing + the **reconnecting transport** (backoff schedule,
  re-mint-on-drop + re-fire-onOpen state re-exchange, budget-exhausted `disconnected` + consumer onClose,
  user-close stops retry) (unit); two-peer **convergence** (integration): late-joiner catch-up, concurrent
  moves of different nodes (no lost update), same-node LWW agreement, **two-client concurrent grouping
  both survive** (collision-proof ids), group⊕move merge, character-level source merge, remote-only
  notifications, and a property test that any interleaving converges. **Relay** integration (over a real
  socket): RBAC viewer-read-only / editor-relayed / forbidden-1008 / bad-token-1008 / role-announced,
  plus the new hardening — **crash-guard** survival of a malformed CRDT frame, **invalid room name** /
  empty-segment / 3-segment → 1008, **tag allow-list** (unknown + inbound CONTROL dropped, presence
  relayed), and **rate-limit** breach on frames/sec and bytes/sec → 1008. The **real** relay + socket
  path (incl. live source + remote cursors) is also covered end-to-end by the app's Playwright two-tab
  specs. Coverage ~97% stmts / 94.6% funcs (ratchet in `vitest.config.ts`).
- **Server (`.mjs`) tests:** a `RoomStore` round-trip incl. fresh-instance-over-same-dir (≈ restart);
  a **local JWKS harness** for the OIDC verifier — a valid token is accepted (user + tenant + roles
  surfaced), while missing/malformed/wrong-audience/wrong-issuer/expired tokens are rejected; and
  **RBAC** — role-from-claims, deny-when-unlisted, unknown-role reject, tenant isolation, `canWrite`.
  The relay's restart-survival, admit-vs-reject (1008), and viewer-read-only / editor-read-write /
  deny-closes enforcement were verified manually.
- **Boundary discipline:** peer/Y data is decoded through `@m/builder`'s Zod overlay decoder before it
  becomes branded state. The materialise step RETURNS the decode `Result` (no throw inside the Yjs
  observer); a decode failure is logged loudly via the `Logger<CollabEvent>` and surfaced as
  `overlay-rejected`, keeping last-good state (no silent fallback, no crash).
- **App integration:** the playground constructs the Yjs session behind a default-off `?collab` flag,
  connects it to the relay, binds the editor to the source `Y.Text`, and labels the client for presence;
  two tabs on `?collab&room=…` edit the **overlay and the text** live and see each other's **cursors**
  (Playwright covers the single-tab Yjs path, two-tab overlay convergence, source sync, and presence).

**Phase 1 is feature-complete.** **Phase 2 is in progress.** Landed: the repo's relay, persistence,
Auth0 verification, rooms/RBAC, and role-aware app UI. Next: browser login and the production store;
Phase 3 covers pub/sub, audit/observability, offline buffering, compaction, and compliance hooks.
