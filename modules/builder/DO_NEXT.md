# @m/builder — do next

- Span-accurate delete (per-line/edge spans from the parser) to replace the line-based heuristic;
  `deleteEdge`; change direction.
- App affordances: multi-select → `connect`; select → `deleteNode` (delete key).
- Property-based tests: relabel/patch round-trips, override survival across edits.
