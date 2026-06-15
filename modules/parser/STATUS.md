# @m/parser — status

**State:** flowchart subset + source spans implemented; `make check` green.

- `parse(text)` → `Result<FlowchartAst, ParseError>` (shell): Chevrotain lexer+grammar → CST → AST.
- `parseWithSource(text)` → `Result<{ ast, source: SourceMap }, ParseError>`: also returns per-node
  id/label text spans (for the builder's two-way patching). `parse` is the ast-only wrapper.
- `parseSequence(text)` / `parseSequenceWithSource(text)` → `SequenceAst` (+ `SequenceSource`:
  message-text and actor-label spans): `sequenceDiagram` subset — `participant [as Label]`,
  messages with the four arrow kinds (`->>`/`-->>`/`->`/`-->`), actors inferred from endpoints.
- `parseC4(text)` / `parseC4WithSource(text)` → `C4Ast` (+ `C4Source`: inner-label spans for each
  element and relation): C4 subset — `Person/System/Container(id, "label")`, nestable
  `Boundary(id, "label") { ... }`, `Rel(from, to, "label")`. `parseC4` is the ast-only wrapper.
- `parseBlock(text)` / `parseBlockWithSource(text)` → `BlockAst` (+ `BlockSource`: label spans for
  explicitly-labelled blocks and pipe-labelled edges): `block-beta` subset — `columns N` directive,
  block declarations `id` / `id["label"]` / `id(label)` / `id{label}` (quotes stripped), and edge
  chains reusing the flowchart link syntax. Columns default to a single row when omitted.
- `parseDiagram(text)` → `Result<DiagramAst, ParseError>`: sniffs the header (skipping blank/`%%`
  lines) and routes to the flowchart, sequence, C4, or block parser.
- `print(ast)` → text (core, pure); round-trip tested (flowchart).
- Supported: `flowchart|graph` + direction, shapes `[]`/`()`/`{}`, links `-->`/`---`/`-.->`/`==>`,
  edge labels `|...|`, `%%` comments, `;`/newline separators.
- tests: 25 passing (printer; flowchart parse/round-trip/spans; sequence parse + spans; C4 parse
  with nesting + label spans; block parse + label/edge spans; diagram routing).
