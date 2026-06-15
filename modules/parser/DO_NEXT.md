# @m/parser — do next

- Capture flowchart edge-label spans too (currently only node id/label spans are in the `SourceMap`).
- Extend the round-trip property to stadium/circle shapes once the parser reproduces them.
- Surface error positions (line/col) in `ParseError`, not just messages.
- Grow the subset: `subgraph`, stadium `([])` / circle `(())` shapes, quoted labels, more link styles.
- Block: grouped `block:id … end`, column spans, and bare-block relabel (wrap into `id["label"]`).
- Network: subnet/zone grouping; bare-node relabel (wrap into `kind id "label"`).
- Cloud: source spans (`CloudSource`) for two-way relabel of groups/leaves/links.
