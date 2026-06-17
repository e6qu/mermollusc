# @m/parser — do next

- `ParseError.positions` now carries `{ offset, length }` per error (lexer + recognition); could add
  a coarse expected-token hint for recognition errors to make messages friendlier.
- Grow the subset: quoted labels, more link styles. *(stadium `([…])` + circle `((…))` shapes parse,
  round-trip, and render. `subgraph id [title] … end` now parses into `FlowchartAst.subgraphs`
  (source-order membership, nestable) and round-trips; **layout/renderer don't group them yet** —
  that's the next subgraph stage, so a subgraph currently lays out flat.)*
- Block: grouped `block:id … end`, column spans, and bare-block relabel (wrap into `id["label"]`).
- Network: subnet/zone grouping; bare-node relabel (wrap into `kind id "label"`).
- Cloud: bare-leaf relabel (wrap into `kind id "label"`); group/region collapse.
