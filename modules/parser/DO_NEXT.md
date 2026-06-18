# @m/parser — do next

- `ParseError.positions` now carries `{ offset, length }` per error (lexer + recognition); could add
  a coarse expected-token hint for recognition errors to make messages friendlier.
- Grow the subset: quoted labels, more link styles. *(stadium `([…])` + circle `((…))` shapes and
  `subgraph id [title] … end` grouping (nestable) all parse, round-trip, and now render — layout
  nests subgraphs via ELK hierarchy and the renderer draws them as `container` boxes.)*
- Block: grouped `block:id … end`, column spans, and bare-block relabel (wrap into `id["label"]`).
- Network: subnet/zone grouping; bare-node relabel (wrap into `kind id "label"`).
- Cloud: bare-leaf relabel (wrap into `kind id "label"`); group/region collapse.
- *(done)* C4: the optional description argument (`Person/System/Container(id, "label", "descr")`)
  now parses into `C4Element.description` (null when omitted); the layout renders it as a second
  label line. Boundaries stay 2-arg.
- State: *(done — composite / nested `state X { … }` with scoped `[*]`)*. Still: fork/join, choice,
  and notes; distinct final states rather than one merged `[*]` end per scope.
- ER: entity attribute blocks (`ENTITY { type name PK }`) — v1 is entities + relationships only.
