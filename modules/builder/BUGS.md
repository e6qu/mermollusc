# @m/builder — bugs

Open (external review, codex `gpt-5.5`, 2026-06-19):

- **Deleting a brace-bodied entity orphans its body.** The app's `removeNode` falls through to the
  line-based `deleteNode` for ER/class/requirement (and composite state); for `CUSTOMER { … }` /
  `class Animal { … }` / `requirement r { … }` that strips only the id line and leaves the `{ … }`
  rows + closing `}`, corrupting the source. Needs family entity-delete that removes the whole brace
  block plus incident relationship lines. *(P1; ER/class/requirement fixed here, composite state still
  open.)*
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
