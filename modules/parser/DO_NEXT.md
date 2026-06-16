# @m/parser — do next

- Extend the round-trip property to stadium/circle shapes once the parser reproduces them.
- Surface error positions (line/col) in `ParseError`, not just messages.
- Grow the subset: `subgraph`, stadium `([])` / circle `(())` shapes, quoted labels, more link styles.
- Block: grouped `block:id … end`, column spans, and bare-block relabel (wrap into `id["label"]`).
- Network: subnet/zone grouping; bare-node relabel (wrap into `kind id "label"`).
- Cloud: bare-leaf relabel (wrap into `kind id "label"`); group/region collapse.
