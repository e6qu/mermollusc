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
  element and relation): C4 subset — `Person/System/Container(id, "label")`, nestable
  `Boundary(id, "label") { ... }`, `Rel(from, to, "label")`. `parseC4` is the ast-only wrapper.
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
  lines) and routes to the flowchart, sequence, C4, block, network, or cloud parser.
- `ParseError` carries `errors: string[]` **and `positions: ErrorPosition[]`** (`{ offset, length }`,
  built by the shared `lexingError`/`recognitionError`/`parseError` helpers in `parse-error.ts`) so a
  host can highlight the offending range; line/column are left to the host to derive from the text.
- `print(ast)` → text (core, pure); round-trip tested (flowchart).
- Supported: `flowchart|graph` + direction, shapes `[]` (rect) / `()` (round) / `([])` (stadium) /
  `(())` (circle) / `{}` (diamond), links `-->`/`---`/`-.->`/`==>`, edge labels `|...|`, `%%`
  comments, `;`/newline separators. (The two-char openers `([`/`((` are lexed before `(`.)
- tests: 40 passing (printer; flowchart parse/node+edge spans incl. stadium/circle; sequence parse + spans; C4 parse with nesting
  + label spans; block parse + label/edge spans; network parse + label spans + icon override; cloud
  parse + nested groups + label spans; routing; plus a **property-based** print→parse round-trip).
