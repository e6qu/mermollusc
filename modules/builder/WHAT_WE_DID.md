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
