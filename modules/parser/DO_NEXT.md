# @m/parser — do next

- Capture flowchart edge-label spans too (currently only node id/label spans are in the `SourceMap`).
- Add property-based round-trip tests (fast-check) over generated flowchart ASTs.
- Surface error positions (line/col) in `ParseError`, not just messages.
- Grow the subset: `subgraph`, stadium `([])` / circle `(())` shapes, quoted labels, more link styles.
- Block: grouped `block:id … end`, column spans, and bare-block relabel (wrap into `id["label"]`).
- Network: subnet/zone grouping; bare-node relabel (wrap into `kind id "label"`).
- Add grammars for the remaining families (cloud) as they land.
