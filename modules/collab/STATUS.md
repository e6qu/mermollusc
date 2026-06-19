# @m/collab — status

**State:** Phase 1 in-memory document — built and green. No network transport yet (by design).

- **What works:** `createCollabSession` wraps a `Y.Doc` (source `Y.Text` + overrides/groups `Y.Map`s).
  Its `overlay` implements the `OverlayDoc` port (move/resize/group/ungroup/lock/label/prune/replace/
  clear, undo/redo via `Y.UndoManager`, persist via injected `save`). Source channel:
  `source`/`setSource`/`spliceSource` + `onSourceChange`. Binary sync: `state`/`applyUpdate`/`onUpdate`.
- **Verified:** 23 tests green — single-client overlay + undo/redo + source (unit), and two-peer
  **convergence** (integration): late-joiner catch-up, concurrent moves of different nodes (no lost
  update), same-node LWW agreement, group⊕move merge, character-level source merge, remote-only change
  notifications, and a property test that any interleaving of independent moves converges. Coverage
  ~97% stmts / ~91% branches (ratchet in `vitest.config.ts`).
- **Boundary discipline:** peer/Y data is decoded through `@m/builder`'s Zod overlay decoder before it
  becomes branded state; a decode failure throws loudly (no silent fallback).
- **App integration:** the playground constructs the Yjs `overlay` behind a default-off `?collab` flag
  (same `OverlayDoc` interface), proving the CRDT document drives the real app unchanged.

**Next:** server-authoritative WebSocket transport + awareness/presence; then live source binding in the
app (CodeMirror ↔ `Y.Text`).
