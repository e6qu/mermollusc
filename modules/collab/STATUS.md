# @m/collab — status

**State:** Phase 1 feature-complete; **Phase 2 in progress** — durable persistence, Auth0 OIDC
verification, **and rooms + RBAC** at the relay. CRDT document, WebSocket transport, live source
binding, presence, restart-survival, token-verified connections, and server-enforced per-document
roles + tenant isolation. Remaining Phase 2: the browser login + the production store. The app always
runs single-user with no relay/persistence/auth.

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
  the issuer's JWKS (Auth0; `jose`) — signature + issuer + audience + expiry — and surfaces the user
  (incl. `tenant` from `org_id` and per-room `roles` claims), or rejects (the relay closes 1008,
  buffering frames during the async check). **Env-gated** (`AUTH0_DOMAIN`/`AUTH0_AUDIENCE`); default is
  allow-all, so local dev / e2e stay zero-auth.
- **RBAC (`server/rbac.mjs`):** `authorizeRoom({ user, room })` resolves the role (owner/editor/viewer)
  or null (no access). The default resolver isolates **tenants** (a tenant-bound user reaches only
  rooms namespaced `<tenant>/…`) and reads **per-room roles** from token claims (authoritative when
  present; an authenticated user with no roles claim defaults to editor). The relay closes 1008 on no
  access and enforces **viewers read-only** (their inbound document frames are dropped; presence still
  relays). Unauthenticated/dev → editor, so single-user and e2e are unaffected.
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
- **Verified:** 32 tests green — single-client overlay + undo/redo + source (unit); transport wiring
  over in-memory paired sockets + a mocked-`WebSocket` `webSocketTransport` + presence-frame routing
  (unit); two-peer **convergence** (integration): late-joiner catch-up, concurrent moves of different
  nodes (no lost update), same-node LWW agreement, group⊕move merge, character-level source merge,
  remote-only notifications, and a property test that any interleaving converges. The **real** relay +
  socket path (incl. live source + remote cursors) is covered end-to-end by the app's Playwright
  two-tab specs. Coverage ~98% stmts (ratchet in `vitest.config.ts`).
- **Server (`.mjs`) tests:** a `RoomStore` round-trip incl. fresh-instance-over-same-dir (≈ restart);
  a **local JWKS harness** for the OIDC verifier — a valid token is accepted (user + tenant + roles
  surfaced), while missing/malformed/wrong-audience/wrong-issuer/expired tokens are rejected; and
  **RBAC** — role-from-claims, deny-when-unlisted, unknown-role reject, tenant isolation, `canWrite`.
  The relay's restart-survival, admit-vs-reject (1008), and viewer-read-only / editor-read-write /
  deny-closes enforcement were verified manually.
- **Boundary discipline:** peer/Y data is decoded through `@m/builder`'s Zod overlay decoder before it
  becomes branded state; a decode failure throws loudly (no silent fallback).
- **App integration:** the playground constructs the Yjs session behind a default-off `?collab` flag,
  connects it to the relay, binds the editor to the source `Y.Text`, and labels the client for presence;
  two tabs on `?collab&room=…` edit the **overlay and the text** live and see each other's **cursors**
  (Playwright covers the single-tab Yjs path, two-tab overlay convergence, source sync, and presence).

**Phase 1 is feature-complete.** **Next:** the production server (Hocuspocus) with auth/persistence —
Phases 2–3 of `docs/collab-editor-plan.md`.
