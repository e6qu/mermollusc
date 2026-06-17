# @m/parser — do next

- `ParseError.positions` now carries `{ offset, length }` per error (lexer + recognition); could add
  a coarse expected-token hint for recognition errors to make messages friendlier.
- Grow the subset: `subgraph`, quoted labels, more link styles. *(stadium `([…])` + circle `((…))`
  shapes now parse and round-trip; a `circle` still renders as a pill until layout squares such nodes.)*
- Block: grouped `block:id … end`, column spans, and bare-block relabel (wrap into `id["label"]`).
- Network: subnet/zone grouping; bare-node relabel (wrap into `kind id "label"`).
- Cloud: bare-leaf relabel (wrap into `kind id "label"`); group/region collapse.
