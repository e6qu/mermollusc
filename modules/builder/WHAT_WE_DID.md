# @m/builder — work log

- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- core: `hitTest` (pure) — node bounds via `rectContains`, edge proximity via point-to-segment
  distance, nodes preferred over edges. 4 unit tests.
- core: pure selection model — `Selection`, `selectOnly`, `toggle`, `isSelected`. 4 unit tests.
- core: sidecar overrides — `moveNode`/`clearOverride`/`applyOverrides` over the `LayoutOverrides`
  contract; `applyOverrides` repositions boxes immediately, edges re-route on relayout. 4 tests.
- core: `relabelNode` (two-way) — rewrites only a node's label span via the parser `SourceMap`
  (bracketed splice / bare wrap), preserving the rest of the file. 3 tests (round-trip via reparse).
- core: `patchSpan` primitive + structural appends `addNode` / `connect` (append a node/edge line,
  reparse-verified). 3 tests.
- core: `deleteNode` (line-based, bracket-aware — strips labels before matching the id so a label
  mention can't false-match; removes the decl + referencing edge lines). 2 tests.
- Added property-based tests (fast-check): `patchSpan` splices exactly the span and round-trips,
  `moveNode`+`applyOverrides` repositions exactly one node, `addNode`/`deleteNode` text invariants.
  +5 tests.
- Added `deleteEdge` (line-based, like `deleteNode`): removes a standalone `from <arrow> to` line
  (ident tokens === `[from, to]`), sparing declarations and multi-hop chains. The app's Delete key
  now removes a selected edge too. +2 tests.
- Added parser-backed property coverage for the two-way patches: `relabelNode` rewrites exactly the
  target node's label (re-parsing confirms the new label and every other node unchanged), and
  `connect` appends exactly one edge with the requested from/to/kind while preserving the nodes.
  +2 property tests (29 total).
- `applyOverrides` now keeps connectors attached when nodes move (no re-layout): an edge whose
  endpoints both shift by the same delta (a group dragged as one) has its route translated so its
  shape is preserved; an edge crossing the moved set is re-anchored to a straight line between the
  boxes' borders (`borderPoint`). It also grows the scene extent to include moved nodes so a node
  dragged past the original bounds isn't clipped by the stage. +2 unit tests (boundary re-anchor,
  group translate).
