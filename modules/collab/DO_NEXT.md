# @m/collab — do next

- *(done)* Phase 1 document: `createCollabSession` (Yjs `Y.Doc` = source `Y.Text` + overlay `Y.Map`s),
  `OverlayDoc`-compatible `overlay`, undo/redo via `Y.UndoManager`, binary-sync seam, in-memory
  convergence tests.
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
- *(done)* **Auth0 OIDC handshake:** `server/auth.mjs` verifies the `?token=` against the issuer JWKS
  (`jose`); the relay admits or closes 1008 (buffering during the async check). Env-gated; default allow.
  Decided to extend our own relay rather than adopt Hocuspocus (§10.5).
- **Browser Auth0 login (next):** wire the Auth0 SPA login so the app obtains a real access token and
  passes it as `?token=`; carry the verified user identity into **presence** (name/colour from the
  token, replacing the random pick) and into rooms.
- *(done)* **Rooms + RBAC:** `server/rbac.mjs` resolves per-document roles (owner/editor/viewer) from
  token claims + isolates tenants by room prefix; the relay closes 1008 on no access and enforces
  viewers read-only. Follow-up: make the **client** read-only for viewers (the editor + canvas reflect
  the role — today the server is the security boundary but the viewer's local edits aren't shared);
  surface the active role in the UI.
- **Production `RoomStore`:** swap the file store for Postgres (update log = audit trail) + S3
  (snapshots) + Redis fan-out — same interface. Needs a real DB to verify end to end.
- **Awareness / presence:** add the Yjs awareness protocol (remote cursors/selections, viewport,
  user identity/color) — ephemeral, not persisted.
- **App source binding:** bind CodeMirror ↔ `Y.Text` (e.g. `y-codemirror.next`) so the `?collab` flag
  drives live two-client text + overlay editing, with remote cursors. Reconcile the Yjs `UndoManager`
  with CodeMirror's text history.
- **Decode-failure surfacing:** today a corrupt peer overlay throws inside the Y observer; once a
  `Logger` is threaded through the shell, log loudly + surface to the UI instead of throwing.
- **Same-key merge for groups:** group objects are stored whole (LWW per group). If concurrent edits to
  one group's membership need finer merge, model members as a nested `Y.Array`/`Y.Map`.
