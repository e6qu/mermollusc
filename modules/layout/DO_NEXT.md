# @m/layout — do next

- Confirm the real elkjs result shape from its source/repo (not memory), then write a Zod
  decoder + typed facade for it in `src/shell`. See `BUGS.md`.
- Define the layout input adapter: AST → ELK graph JSON (nodes, edges, nesting, ports).
- Define core invariants for property tests: children inside parents, no node overlap,
  edges terminate on node borders.
- Add unit (property-based) tests in `test/unit`.
