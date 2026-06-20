# @m/collab — plan

Collaborative document model — the Yjs-backed CRDT implementation of the editor's shared state.
Phase 1 of [`docs/collab-editor-plan.md`](../../docs/collab-editor-plan.md).

## Responsibility

- Hold the **shared** editor state in one `Y.Doc`: the diagram **source text** (`Y.Text`) and the
  sidecar **overlay** (manual node positions/sizes + element groups, in two `Y.Map`s).
- Provide a `CollabSession` whose `overlay` satisfies the `@m/contracts` **`OverlayDoc`** port, so the
  app swaps the local single-user document for the collaborative one without touching call sites.
- Expose the binary-sync seam (`state`/`applyUpdate`/`onUpdate`) a transport (a WebSocket server, or an
  in-memory test) wires between peers, plus remote-change notifications (`onSourceChange`,
  `onOverlayChange`).
- Reuse the **pure** overlay operations and the Zod overlay decoder from `@m/builder` — peer data
  crosses the boundary validated, never trusted raw — so the merge logic stays single-sourced.

It explicitly does **not** derive the diagram (that stays a local pure-core computation in the app from
the merged source+overlay — see the plan §4), own a network transport/server, or do auth/persistence
(those are Phases 2–3).

## Public API (stable surface)

- `createCollabSession({ initialOverrides, initialGroups, initialSource, save }) → CollabSession`
- `CollabSession`: `overlay: OverlayDoc`, `source()/setSource()/spliceSource()`,
  `sourceBinding()` (a CodeMirror extension binding the editor to the source `Y.Text`),
  `onSourceChange()/onOverlayChange()`, `state()/applyUpdate()/onUpdate()`, `destroy()`.
- Transport: `connectTransport(session, socket)` / `webSocketTransport(url)` / `connectWebSocket`.

## Design notes

- **Storage shape mirrors `serializeOverlay`.** Each override/group is stored in its `Y.Map` in the
  exact plain-object shape `@m/builder`'s `decodeOverlay` already validates, so materialising the
  branded maps reuses that decoder verbatim.
- **Per-key LWW.** Overrides/groups are keyed by id, so concurrent edits to *different* elements both
  survive; concurrent edits to the *same* element converge to one agreed value. Source text merges at
  the character level (`Y.Text`).
- **Origins.** Local edits use a `LOCAL` transaction origin (tracked for undo, broadcast on `onUpdate`);
  applied remote updates use `REMOTE` (not re-broadcast); the initial seed uses `SEED` (kept out of
  history). Undo/redo is a `Y.UndoManager` scoped to `LOCAL` — each user undoes only their own edits.

## Roadmap

Phase 1 (this module): the document + in-memory convergence. Next: a server-authoritative WebSocket
transport, awareness/presence, then durability + auth (Phases 2–3 of the plan).
