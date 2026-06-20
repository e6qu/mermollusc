# @m/collab — do next

- *(done)* Phase 1 document: `createCollabSession` (Yjs `Y.Doc` = source `Y.Text` + overlay `Y.Map`s),
  `OverlayDoc`-compatible `overlay`, undo/redo via `Y.UndoManager`, binary-sync seam, in-memory
  convergence tests.
- *(done)* **Dev transport:** `connectTransport`/`webSocketTransport`/`connectWebSocket` bind the
  binary-sync seam to a `WebSocket`; `dev-server.mjs` is a server-authoritative relay (rooms, per-room
  `Y.Doc`, state-on-join + broadcast). Two `?collab` tabs converge live (Playwright). No auth/persistence
  /presence yet.
- **Production server (next):** replace the dev relay with a Node Yjs server (Hocuspocus) that owns
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
