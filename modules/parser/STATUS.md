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
- `parseDiagram(text)` → `Result<DiagramAst, ParseError>`: sniffs the header (skipping blank/`%%`
  lines) and routes to the flowchart, sequence, or C4 parser.
- `print(ast)` → text (core, pure); round-trip tested (flowchart).
- Supported: `flowchart|graph` + direction, shapes `[]`/`()`/`{}`, links `-->`/`---`/`-.->`/`==>`,
  edge labels `|...|`, `%%` comments, `;`/newline separators.
- tests: 19 passing (printer; flowchart parse/round-trip/spans; sequence parse + spans; C4 parse
  with nesting + label spans; diagram routing for all three families).
