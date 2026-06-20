# @m/builder — bugs

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

Checked while adding family-specific C4 and sequence delete patchers.

Checked while adding sidecar group labels.

Checked while adding resizeNode (manual node sizing).

Checked while adding pruneGroups (drop groups whose nodes the text removed).

Checked while adding the ER connect/delete patchers.
