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
- ER: *(done)* entity attribute blocks (`ENTITY { type name PK,FK "comment" }`) parse into
  `ErEntity.attributes` (type, name, keys, comment); keys lex as identifiers and are classified in the
  CST→AST step, commas between keys are skipped. Relationships + bare entities already parsed.
- Class: *(done)* `classDiagram` — member bodies + the `Foo : member` shorthand + the UML relationship
  operators (inheritance/realization/composition/aggregation/association/dependency) + *(done)*
  stereotypes (`<<interface>>`/`<<abstract>>` → `ClassEntity.stereotype`, rendered as a `«…»`
  subtitle). Still: per-end multiplicity labels (`"1" --> "*"`), generics (`List~T~`), namespaces.
- Requirement: *(done)* `requirementDiagram` — requirement/element bodies (`key: value`) + the seven
  relationship verbs (both arrow directions). Still: requirement `id`/`risk`/`verifymethod` enum
  validation (currently free text), and the `style`/`class` styling directives.
- gitGraph: *(done — `commit`/`branch`/`checkout`/`switch`/`merge` with `id:`/`tag:`/`type:` and
  `LR`/`TB`/`BT` directions)*. Still: `cherry-pick`, commit `type: REVERSE`/`HIGHLIGHT` distinct glyphs
  (parsed; only HIGHLIGHT→rect is rendered today), and explicit `gitGraph` config (e.g. `mainBranchName`).
