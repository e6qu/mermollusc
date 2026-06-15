# @m/parser — do next

- Capture edge-label spans too (currently only node id/label spans are in the `SourceMap`).
- Add property-based round-trip tests (fast-check) over generated flowchart ASTs.
- Surface error positions (line/col) in `ParseError`, not just messages.
- Grow the subset: `subgraph`, stadium `([])` / circle `(())` shapes, quoted labels, more link styles.
- Add grammars for the other families (sequence, C4, block/network) as they land.
