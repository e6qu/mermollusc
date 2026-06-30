# @m/builder — bugs

_None known._

## Resolved

- ~~**The no-style display path bypassed mount snapping.**~~ Fixed — `applyStyles` now honors
  `snapToMountPoints` before its empty-style early return, so graphs with no edge/node style sidecar still
  render connector endpoints on cardinal mounts.

- ~~**`deleteActor`'s `SEQ_NOTE` branch was unreachable.**~~ Fixed by making sequence notes real: the
  parser now lexes/parses `note (left of|right of|over) <actors> : text` into `SequenceAst.notes`, the
  layout stacks them as `stateNote` boxes interleaved by source order, and the renderer draws them. So a
  rendered sequence can now contain a `note` line, deleting an actor strips the notes anchored to it
  (`SEQ_NOTE` is live), and a note box is itself selectable → relabel (its text span) / delete
  (`deleteLineAt`). The sequence example shows an `over` and a `left of` note.

Resolved (external review, codex `gpt-5.5`, 2026-06-19):

- ~~**Deleting a brace-bodied entity orphans its body.**~~ Fixed — the app's `removeNode` routed
  ER/class/requirement to body-aware deletes but fell through to line-based `deleteNode` for composite
  `state X { … }`, orphaning the body rows + closing `}`. Now `deleteStateEntity` reuses the shared
  `deleteEntityWithBody` brace-matcher (declarations `state id` / `state "…" as id` opening a block, the
  `id : desc` form, transitions `a --> b`, and `note … of id`), so deleting a composite removes its
  whole block and everything bound to it and the source stays parseable. (+builder integration tests
  ×2, +app e2e selecting the composite container and Deleting.)
- ~~**Drag/resize extent only grows right/down.**~~ Fixed — `applyOverrides` now emits the true bounds
  (a negative extent *origin*, not just grown width/height), including edge waypoints. The app offsets
  paint, pointer→scene (`scenePoint`), the minimap, and SVG export (`toSvg` gained an `origin`) by the
  extent origin, so a node dragged past the top-left stays visible and hit-testable (the origin is
  (0,0) — unchanged — unless something is dragged negative). Covered by a builder extent unit test + a
  `toSvg` offset test; a full off-canvas-drag e2e is impractical (pointer leaves the canvas element).

- ~~**Inline relabel/reshape could write un-parseable source.**~~ Fixed — a label containing the target
  shape's closing delimiter (`]`/`)`/`}`) or a newline was spliced straight into the bracket, corrupting
  the source. `relabelNode`/`reshapeNode` now validate the label first (reshape against the target
  shape's closer; relabel against all bracket closers, since the span doesn't carry the existing shape)
  and return a loud `PatchError`. The edge/element label path (which the app shell spliced raw) is now
  guarded by the pure `validateLabel(label, context)`, keyed on a closed context union
  (`flowchartBracket`/`pipe`/`quoted`/`colon`/`plain`). (+property test: relabel on hostile labels
  round-trips or errs, never corrupts; +per-context `validateLabel` rejection tests.) The app shell calls
  the guard before committing inline span edits, including timeline/gantt colon-delimited labels, and
  surfaces the `PatchError` in the status HUD.

Checked while adding family-specific C4 and sequence delete patchers.

Checked while adding sidecar group labels.

Checked while adding resizeNode (manual node sizing).

Checked while adding pruneGroups (drop groups whose nodes the text removed).

Checked while adding the ER connect/delete patchers.

Checked while adding the Gantt dependency-start rewrite helper.

Checked while making side-centre mount snapping opt-in for manual override/style application.

Checked while adding persisted route-relative edge-label positions.
