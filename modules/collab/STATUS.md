# @m/collab — status

**State:** Phase 1 feature-complete; **Phase 2 in progress** — durable persistence **and Auth0 OIDC
verification** at the relay handshake. CRDT document, WebSocket transport, live source binding,
presence, a relay that survives restart, and token-verified connections. Rooms + RBAC are next. The
app always runs single-user with no relay/persistence/auth.

- **What works:** `createCollabSession` wraps a `Y.Doc` (source `Y.Text` + overrides/groups `Y.Map`s).
  Its `overlay` implements the `OverlayDoc` port (move/resize/group/ungroup/lock/label/prune/replace/
  clear, undo/redo via `Y.UndoManager`, persist via injected `save`). Source channel:
  `source`/`setSource`/`spliceSource` + `onSourceChange`. Binary sync: `state`/`applyUpdate`/`onUpdate`.
- **Transport:** `connectTransport(session, socket)` binds the binary-sync seam to any `CollabSocket`;
  `webSocketTransport(url)`/`connectWebSocket(session, url)` use the platform `WebSocket`.
- **Server (`server/relay.mjs`):** a server-authoritative relay (rooms by URL path; per-room `Y.Doc`;
  full state on join + broadcast). `make collab-server` runs it. **Optional** — the app runs fully
  single-user without it.
- **Persistence (`server/store.mjs`):** a pluggable `RoomStore` — in-memory default + a file-snapshot
  store (`PERSIST_DIR`). The relay loads a room's snapshot on first join and saves (debounced + flush on
  room close), so rooms survive a restart. Production target: Postgres + S3 (same interface).
- **Auth (`server/auth.mjs`):** the `authorize(req)` hook verifies the connection's `?token=` against
  the issuer's JWKS (Auth0; `jose`) — signature + issuer + audience + expiry — and surfaces the user, or
  rejects (the relay closes 1008, buffering frames during the async check). **Env-gated**
  (`AUTH0_DOMAIN`/`AUTH0_AUDIENCE`); default is allow-all, so local dev / e2e stay zero-auth.
- **Source binding:** `sourceBinding()` returns a y-codemirror.next extension that two-way-binds the
  editor to the source `Y.Text` (character-level merge, per-user text undo). The `Y.Text` stays
  encapsulated — only an opaque CodeMirror extension crosses the boundary. Two `?collab` tabs now share
  the diagram **text** live, each re-deriving its diagram locally.
- **Presence:** a y-protocols `Awareness` rides the same transport on a distinct frame. `setLocalUser`
  labels the client (name/colour); the source binding tracks the local cursor into awareness, so remote
  carets/selections render in peers' editors. Ephemeral — relayed, never stored.
- **Verified:** 32 tests green — single-client overlay + undo/redo + source (unit); transport wiring
  over in-memory paired sockets + a mocked-`WebSocket` `webSocketTransport` + presence-frame routing
  (unit); two-peer **convergence** (integration): late-joiner catch-up, concurrent moves of different
  nodes (no lost update), same-node LWW agreement, group⊕move merge, character-level source merge,
  remote-only notifications, and a property test that any interleaving converges. The **real** relay +
  socket path (incl. live source + remote cursors) is covered end-to-end by the app's Playwright
  two-tab specs. Coverage ~98% stmts (ratchet in `vitest.config.ts`).
- **Server (`.mjs`) tests:** a `RoomStore` round-trip incl. fresh-instance-over-same-dir (≈ restart);
  and a **local JWKS harness** for the OIDC verifier — a valid token is accepted (user surfaced),
  while missing/malformed/wrong-audience/wrong-issuer/expired tokens are rejected. The relay's
  restart-survival and admit-vs-reject (close 1008, with frame buffering) flows were verified manually.
- **Boundary discipline:** peer/Y data is decoded through `@m/builder`'s Zod overlay decoder before it
  becomes branded state; a decode failure throws loudly (no silent fallback).
- **App integration:** the playground constructs the Yjs session behind a default-off `?collab` flag,
  connects it to the relay, binds the editor to the source `Y.Text`, and labels the client for presence;
  two tabs on `?collab&room=…` edit the **overlay and the text** live and see each other's **cursors**
  (Playwright covers the single-tab Yjs path, two-tab overlay convergence, source sync, and presence).

**Phase 1 is feature-complete.** **Next:** the production server (Hocuspocus) with auth/persistence —
Phases 2–3 of `docs/collab-editor-plan.md`.
