# @m/collab — do next

- *(done)* Phase 1 document: `createCollabSession` (Yjs `Y.Doc` = source `Y.Text` + overlay `Y.Map`s),
  `OverlayDoc`-compatible `overlay`, undo/redo via `Y.UndoManager`, binary-sync seam, in-memory
  convergence tests.
- **Transport (next):** a server-authoritative WebSocket layer over the `state`/`applyUpdate`/`onUpdate`
  seam — extend a Node Yjs server (Hocuspocus). Keep the doc transport-agnostic; the server owns
  auth/rooms/persistence (Phases 2–3 of `docs/collab-editor-plan.md`).
- **Awareness / presence:** add the Yjs awareness protocol (remote cursors/selections, viewport,
  user identity/color) — ephemeral, not persisted.
- **App source binding:** bind CodeMirror ↔ `Y.Text` (e.g. `y-codemirror.next`) so the `?collab` flag
  drives live two-client text + overlay editing, with remote cursors. Reconcile the Yjs `UndoManager`
  with CodeMirror's text history.
- **Decode-failure surfacing:** today a corrupt peer overlay throws inside the Y observer; once a
  `Logger` is threaded through the shell, log loudly + surface to the UI instead of throwing.
- **Same-key merge for groups:** group objects are stored whole (LWW per group). If concurrent edits to
  one group's membership need finer merge, model members as a nested `Y.Array`/`Y.Map`.
