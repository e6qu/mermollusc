# @m/collab — do next

- *(done)* Phase 1 document: `createCollabSession` (Yjs `Y.Doc` = source `Y.Text` + overlay `Y.Map`s),
  `OverlayDoc`-compatible `overlay`, undo/redo via `Y.UndoManager`, binary-sync seam, in-memory
  convergence tests.
- *(done)* `OverlayDoc.replaceOverrides` is implemented by the Yjs overlay, keeping collaborative and
  local regenerate behavior aligned.
- *(done)* **Dev transport:** `connectTransport`/`webSocketTransport`/`connectWebSocket` bind the
  binary-sync seam to a `WebSocket`; `dev-server.mjs` is a server-authoritative relay (rooms, per-room
  `Y.Doc`, state-on-join + broadcast). Two `?collab` tabs converge live (Playwright). No auth/persistence
  /presence yet.
- *(done)* **Live source binding:** `sourceBinding()` (y-codemirror.next) two-way-binds the editor to
  the source `Y.Text`; two `?collab` tabs share the diagram text live (character merge, per-user text
  undo). The app drops CodeMirror's own history in collab mode and seeds the room if empty.
- *(done)* **Presence:** a y-protocols `Awareness` rides the transport on a distinct frame;
  `setLocalUser` labels the client and the source binding tracks the local cursor into awareness, so
  remote carets render in peers' editors. Follow-up: presence on the **canvas** (remote selection
  highlights) + a viewport/active-users indicator.
- *(done)* **Durable persistence:** the relay (`server/relay.mjs`) has a pluggable `RoomStore`
  (`server/store.mjs`) — memory default + a file-snapshot store (`PERSIST_DIR`); rooms survive a restart.
  Every connection passes an `authorize(req)` hook (default allow) — the auth seam. The server is
  optional; single-user local needs none of it.
- *(done)* **Browser room snapshot seam:** `src/shell/store.ts` provides memory + Web Storage
  `RoomStore` implementations and `createCollabSession` can hydrate from a saved Yjs `initialUpdate`.
  The Pages demo can persist a local room through the same whole-snapshot contract as the relay.
- *(done)* **Server/browser store semantics aligned:** the Node relay memory store now copies snapshots
  on save/load just like the browser `RoomStore`, and the relay uses the same `RoomStore` constructor
  naming (`createMemoryRoomStore` / `createFileRoomStore`).
- *(done)* **Auth0 OIDC handshake:** `server/auth.mjs` verifies the `?token=` against the issuer JWKS
  (`jose`); the relay admits or closes 1008 (buffering during the async check). Env-gated; default allow.
  Decided to extend our own relay rather than adopt Hocuspocus (§10.5).
- **Browser Auth0 login (next):** wire the Auth0 SPA login so the app obtains a real access token and
  passes it as `?token=`; carry the verified user identity into **presence** (name/colour from the
  token, replacing the random pick) and into rooms.
- *(done)* **Rooms + RBAC:** `server/rbac.mjs` resolves per-document roles + isolates tenants; the relay
  closes 1008 on no access and enforces viewers read-only.
- *(done)* **Role-aware client:** the relay sends the role (a CONTROL frame); the app makes a viewer's
  editor + canvas read-only with a "view only" badge. Follow-up: a presence "active users" list
  (names/colours from awareness), and owner-only affordances (e.g. manage members) once memberships exist.
- **Production `RoomStore`:** swap the file store for Postgres (update log = audit trail) + S3
  (snapshots) + Redis fan-out. Browser-local embedded storage is now represented by the async IndexedDB
  room store behind the same snapshot interface; SQLite/WASM remains optional only if future queries
  outgrow whole-room snapshots.
- *(done)* **Decode-failure surfacing:** a corrupt peer overlay no longer throws inside the Y observer —
  `materialize` returns the decode `Result`; the observer logs `overlay-decode-rejected` via a
  `Logger<CollabEvent>` (threaded through `createCollabSession({ logger })`), surfaces a `CollabStatus`
  via `onStatusChange`, and keeps last-good state.
- *(done)* **Relay + transport hardening:** crash guard around `applyUpdate` + `socket`/`wss` error
  handlers; per-socket frames/sec + bytes/sec token-bucket rate limit (injectable); frame-tag allow-list
  (DOC/AWARE only); room-name validation at the boundary; throttled viewer-drop log; graceful flush on
  SIGINT/SIGTERM; RBAC fail-closed default. `reconnectingWebSocketTransport` self-heals a dropped socket
  (backoff + jitter + cap, re-exchange on reopen, `ReconnectStatus`). Collision-proof group ids.
- **App wiring (*done*):** the app uses `reconnectingWebSocketTransport` + `connectTransport`, surfaces
  `ReconnectStatus` (reconnecting/reconnected/disconnected) and the session's `onStatusChange`
  (`overlay-rejected`) as status-bar messages, and passes a console logger — all behind the default-off
  `?collab` flag (`app/playground/src/main.ts`).
- **Membership source (next):** with the fail-closed RBAC default, an auth-on deployment needs a real
  per-room roles claim (or a server-side membership store behind `authorizeRoom`) so authenticated users
  aren't all denied. Wire it alongside the browser Auth0 login.
- **Same-key merge for groups (own PR — architectural):** group objects are stored whole (LWW per group).
  Finer merge means modelling members as a nested `Y.Array`/`Y.Map` — but that diverges from this module's
  deliberate invariant that *each group is one Y.Map value encoded through the builder's shared per-entry
  encoder* (the single source of truth shared with JSON persistence; see `session.ts`). Nesting a CRDT
  inside the group needs its own encode/decode path, multi-client convergence tests, and a wire-format
  change — a deliberate design decision for an experimental, gated feature's rare scenario (two clients
  editing one group's membership at once). It deserves a focused PR, not a bundled line-item.
