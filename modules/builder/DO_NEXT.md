# @m/builder — do next

- DOM drag wiring (shell): pointer events → `moveNode` + `applyOverrides` for live feedback.
- Structural text patching: map a canvas edit to CST source-span range edits (needs parser spans).
- Coordinate with `@m/layout` consuming overrides as ELK fixed pins / relax seeds.
- Property-based tests: patch round-trips, override survival across edits.
