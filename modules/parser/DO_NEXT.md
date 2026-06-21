# @m/parser — do next

- **Gantt family arc** (in progress). Done: standalone `parseGantt` (subset — sections, tasks with
  status/id/date-or-`after` start/duration) **and `layoutGantt`** (bars on a day axis; ISO dates +
  `after` chains). Next PRs: (1) any renderer support (bars are plain rect + label nodes — likely
  renders as-is; a date-axis/section-band draw is later polish); (2) **activation** — add `GanttAst` to
  the `DiagramAst` union, wire `parseGantt` into `parseDiagram`, and fill the now-exhaustive app
  switches (`removeNode`/`removeEdge`/`appendEdge`/render-switch) + `layoutDiagram` + an app example +
  golden. Parser follow-ups for the subset: `milestone` tasks (0-duration), multiple `after` refs,
  `excludes`/`tickInterval` directives.
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
- State: *(done — composite / nested `state X { … }` with scoped `[*]`; `<<fork>>`/`<<join>>`/
  `<<choice>>` annotations → fork/join bars + choice diamond)*. Still: distinct final states rather than one merged `[*]` end per scope.
- ER: *(done)* entity attribute blocks (`ENTITY { type name PK,FK "comment" }`) parse into
  `ErEntity.attributes` (type, name, keys, comment); keys lex as identifiers and are classified in the
  CST→AST step, commas between keys are skipped. Relationships + bare entities already parsed.
- Class: *(done)* `classDiagram` — member bodies + the `Foo : member` shorthand + the UML relationship
  operators (inheritance/realization/composition/aggregation/association/dependency) + *(done)*
  stereotypes (`<<interface>>`/`<<abstract>>` → `ClassEntity.stereotype`, rendered as a `«…»`
  subtitle) + *(done)* generics (`List~T~` → `List<T>` for display, raw id preserved). Still: namespaces. (multiplicity: done)
- Requirement: *(done)* `requirementDiagram` — requirement/element bodies (`key: value`) + the seven
  relationship verbs (both arrow directions). Still: requirement `id`/`risk`/`verifymethod` enum
  validation (currently free text), and the `style`/`class` styling directives.
- gitGraph: *(done — `commit`/`branch`/`checkout`/`switch`/`merge` with `id:`/`tag:`/`type:` and
  `LR`/`TB`/`BT` directions)*. Still: `cherry-pick`, commit `type: REVERSE`/`HIGHLIGHT` distinct glyphs
  (parsed; only HIGHLIGHT→rect is rendered today), and explicit `gitGraph` config (e.g. `mainBranchName`).
- timeline: *(done — `title`/`section`/`period : event` with `:`-continuation lines, two-mode lexer;
  `<br>` soft line breaks → multi-line cells)*. Still: explicit per-section ordering.
- mindmap: *(done — indentation hierarchy, shapes, icon/class stripped; radial layout engine)*. Still:
  real `::icon()` rendering once an icon pack is wired; curved spokes (done).
- pie: *(done — `pie [showData]`, optional title, `"label" : value` rows, non-positive fails loudly;
  `showData` now renders the raw value in the legend)*.
- DOT (Graphviz): *(done — import of a `graph`/`digraph` subset → flowchart, incl. `cluster*` subgraphs
  → `FlowSubgraph`; export via `toDot` with `rankdir`)*. Still: HTML-label handling; DOT-export of
  clusters (from `FlowSubgraph`); ports.
