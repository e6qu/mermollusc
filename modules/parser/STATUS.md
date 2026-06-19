# @m/parser — status

**State:** flowchart subset + source spans implemented; `make check` green.

- `parse(text)` → `Result<FlowchartAst, ParseError>` (shell): Chevrotain lexer+grammar → CST → AST.
- `parseWithSource(text)` → `Result<{ ast, source: SourceMap }, ParseError>`: also returns per-node
  id/label text spans **and per-edge `|label|` spans** (for the builder's two-way patching). `parse`
  is the ast-only wrapper.
- `parseSequence(text)` / `parseSequenceWithSource(text)` → `SequenceAst` (+ `SequenceSource`:
  message-text and actor-label spans): `sequenceDiagram` subset — `participant [as Label]`,
  messages with the four arrow kinds (`->>`/`-->>`/`->`/`-->`), actors inferred from endpoints.
- `parseC4(text)` / `parseC4WithSource(text)` → `C4Ast` (+ `C4Source`: inner-label spans for each
  element and relation): C4 subset — `Person/System/Container(id, "label"[, "description"])`, nestable
  `Boundary(id, "label") { ... }`, `Rel(from, to, "label")`. The optional element description lands in
  `C4Element.description` (null when omitted). `parseC4` is the ast-only wrapper.
- `parseBlock(text)` / `parseBlockWithSource(text)` → `BlockAst` (+ `BlockSource`: label spans for
  explicitly-labelled blocks and pipe-labelled edges): `block-beta` subset — `columns N` directive,
  block declarations `id` / `id["label"]` / `id(label)` / `id{label}` (quotes stripped) with an
  optional `icon "<pack>/<name>"` override, and edge chains reusing the flowchart link syntax.
- `parseNetwork(text)` / `parseNetworkWithSource(text)` → `NetworkAst` (+ `NetworkSource`: inner
  label spans for quoted node/link labels): `network` subset — kind-typed node declarations
  (`server`/`database`/`cloud`/`router`/`switch`/`firewall`/`host`) with an optional per-node
  `icon "<pack>/<name>"` override (malformed refs ignored), and undirected links `a -- b : "label"`.
  Single-mode lexer (labels are always quoted).
- `parseCloud(text)` / `parseCloudWithSource(text)` → `CloudAst` (+ `CloudSource`: inner-label spans
  for groups, service leaves, and links): `cloud` subset — nestable `group "label" { … }` (synthetic
  ids `g0`…), kind-typed leaves (`compute`/`storage`/`database`/`queue`/`cdn`) with an optional
  per-leaf `icon "<pack>/<name>"` override, undirected links `a -- b : "label"`. `parseCloud` is the
  ast-only wrapper.
- `parseDiagram(text)` → `Result<DiagramAst, ParseError>`: sniffs the header (skipping blank/`%%`
  lines) and routes to the flowchart, sequence, C4, block, network, cloud, state, ER, class,
  requirement, gitGraph, timeline, mindmap, or pie parser — or to **DOT import** (`digraph`/`strict`,
  and `graph` only when its header line has `{`, so Mermaid's `graph TD` isn't stolen).
- `parseDot(text)` → `Result<FlowchartAst, ParseError>`: Graphviz DOT import — a `[strict]
  (graph|digraph) { … }` subset (node/edge statements, `a -> b -> c` chains, default-attr statements,
  `rankdir`/`label`/`shape`/`style`, and nested `subgraph` blocks — `cluster*` ones become
  `FlowSubgraph` boxes, others are transparent) imported into the flowchart model. Not a new family;
  ports/HTML labels are out of scope.
- `parseState(text)` / `parseStateWithSource(text)` → `StateAst` (+ `StateSource`): `stateDiagram-v2`
  subset — transitions `A --> B [: label]` (endpoints are identifiers or the `[*]` start/end
  pseudo-state), descriptions `A : label`, `state "Label" as A`, and **composite states**
  `state X { … }` (recursive; each composite scopes its own `[*]`, mirrors `FlowSubgraph` membership/
  nesting → `StateAst.composites`). Source spans cover each state's label and each transition's label.
- `parseEr(text)` / `parseErWithSource(text)` → `ErAst` (+ `ErSource`: entity-id and relationship-label
  spans): `erDiagram` subset — the crow's-foot operator (`||--o{` etc.) is lexed whole and split into
  normalised `fromCard`/`toCard` + identifying (`--`) vs non-identifying (`..`); entities come from
  endpoints or bare declarations (quoted names allowed); `: label` for the verb; and **attribute
  blocks** `ENTITY { type name PK,FK "comment" … }` → `ErEntity.attributes` (keys lex as identifiers,
  classified to `PK`/`FK`/`UK` in the AST step; commas skipped). The `}` brace is lexed *after* the
  relationship operator so a leading `}` stays the cardinality token.
- `parseClass(text)` / `parseClassWithSource(text)` → `ClassAst` (+ `ClassSource`: class-name and
  relationship-label spans): `classDiagram` subset — `class Foo { +int id\n +area() double }` member
  bodies (each member is a whole line in a dedicated lexer mode), the `Foo : +member` shorthand, and
  relationship lines whose operator (`<|--`/`--|>`/`*--`/`o--`/`-->`/`..>`/`..|>`/`--`) splits into
  `fromArrow`/`toArrow` (`ClassArrow`) + a dashed flag. Members carry visibility (`+`/`-`/`#`/`~`) and
  a field/method `kind`; a `<<interface>>`/`<<abstract>>` body line → `ClassEntity.stereotype`.
  (Multiplicity labels + generics are future work.)
- `parseRequirement(text)` / `parseRequirementWithSource(text)` → `RequirementAst` (+ `ReqSource`:
  entity-name spans): `requirementDiagram` subset — `requirement foo { key: value … }` /
  `element bar { … }` declarations (the six requirement types + `element`; body lines split on the
  first `:`), and relationship lines `a - verb -> b` / `a <- verb - b` (verb ∈ the seven `ReqRelKind`s,
  arrow direction sets from/to).
- `ParseError` carries `errors: string[]` **and `positions: ErrorPosition[]`** (`{ offset, length }`,
  built by the shared `lexingError`/`recognitionError`/`parseError` helpers in `parse-error.ts`) so a
  host can highlight the offending range; line/column are left to the host to derive from the text.
- `print(ast)` → text (core, pure); round-trip tested (flowchart).
- Supported: `flowchart|graph` + direction, shapes `[]` (rect) / `()` (round) / `([])` (stadium) /
  `(())` (circle) / `{}` (diamond), links `-->`/`---`/`-.->`/`==>`, edge labels `|...|`, `%%`
  comments, `;`/newline separators, and `subgraph id [title] … end` grouping (nestable) →
  `FlowchartAst.subgraphs` with source-order membership. (The two-char openers `([`/`((` are lexed
  before `(`; `subgraph`/`end` are keywords with `longer_alt: Identifier`. Offset tracking is on so
  the builder claims a node for the subgraph it's declared in, then emits a canonical node order
  that the printer mirrors for round-trip.)
- tests: 54 passing (printer incl. subgraph blocks; flowchart parse/node+edge spans incl. stadium/circle + subgraph membership/nesting/round-trip; sequence parse + spans; C4 parse with nesting
  + label spans; block parse + label/edge spans; network parse + label spans + icon override; cloud
  parse + nested groups + label spans; routing; plus a **property-based** print→parse round-trip).
