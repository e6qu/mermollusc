# @m/parser — do next

- `ParseError.positions` now carries `{ offset, length }` per error (lexer + recognition); could add
  a coarse expected-token hint for recognition errors to make messages friendlier.
- Grow the subset: quoted labels, more link styles. *(stadium `([…])` + circle `((…))` shapes and
  `subgraph id [title] … end` grouping (nestable) all parse, round-trip, and now render — layout
  nests subgraphs via ELK hierarchy and the renderer draws them as `container` boxes.)*
- Block: grouped `block:id … end`, column spans, and bare-block relabel (wrap into `id["label"]`).
- Network: subnet/zone grouping; bare-node relabel (wrap into `kind id "label"`).
- Cloud: bare-leaf relabel (wrap into `kind id "label"`); group/region collapse.
- C4: accept the optional description argument Mermaid allows — `Person(id, "label", "descr")` and
  likewise for `System`/`Container` — currently only the 2-arg `Person(id, "label")` form parses.
