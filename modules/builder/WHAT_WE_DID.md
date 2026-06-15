# @m/builder — work log

- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- core: `hitTest` (pure) — node bounds via `rectContains`, edge proximity via point-to-segment
  distance, nodes preferred over edges. 4 unit tests.
- core: pure selection model — `Selection`, `selectOnly`, `toggle`, `isSelected`. 4 unit tests.
- core: sidecar overrides — `moveNode`/`clearOverride`/`applyOverrides` over the `LayoutOverrides`
  contract; `applyOverrides` repositions boxes immediately, edges re-route on relayout. 4 tests.
