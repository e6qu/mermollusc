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
- **Production server (Phase 1 → 2 handoff):** replace the dev relay with a Node Yjs server (Hocuspocus) that owns
  auth (OIDC), rooms + RBAC, and durable persistence (Postgres update log + S3 snapshots + Redis
  fan-out) — Phases 2–3 of `docs/collab-editor-plan.md`. The client transport is unchanged.
- **Awareness / presence:** add the Yjs awareness protocol (remote cursors/selections, viewport,
  user identity/color) — ephemeral, not persisted.
- **App source binding:** bind CodeMirror ↔ `Y.Text` (e.g. `y-codemirror.next`) so the `?collab` flag
  drives live two-client text + overlay editing, with remote cursors. Reconcile the Yjs `UndoManager`
  with CodeMirror's text history.
- **Decode-failure surfacing:** today a corrupt peer overlay throws inside the Y observer; once a
  `Logger` is threaded through the shell, log loudly + surface to the UI instead of throwing.
- **Same-key merge for groups:** group objects are stored whole (LWW per group). If concurrent edits to
  one group's membership need finer merge, model members as a nested `Y.Array`/`Y.Map`.
