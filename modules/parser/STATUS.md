# @m/parser — status

**State:** flowchart subset + source spans implemented; `make check` green.

- `parse(text)` → `Result<FlowchartAst, ParseError>` (shell): Chevrotain lexer+grammar → CST → AST.
- `parseWithSource(text)` → `Result<{ ast, source: SourceMap }, ParseError>`: also returns per-node
  id/label text spans (for the builder's two-way patching). `parse` is the ast-only wrapper.
- `parseSequence(text)` / `parseSequenceWithSource(text)` → `SequenceAst` (+ `SequenceSource`:
  message-text and actor-label spans): `sequenceDiagram` subset — `participant [as Label]`,
  messages with the four arrow kinds (`->>`/`-->>`/`->`/`-->`), actors inferred from endpoints.
- `parseDiagram(text)` → `Result<DiagramAst, ParseError>`: sniffs the header (skipping blank/`%%`
  lines) and routes to the flowchart or sequence parser.
- `print(ast)` → text (core, pure); round-trip tested (flowchart).
- Supported: `flowchart|graph` + direction, shapes `[]`/`()`/`{}`, links `-->`/`---`/`-.->`/`==>`,
  edge labels `|...|`, `%%` comments, `;`/newline separators.
- tests: 9 passing (printer; parse + round-trip + fail-loud; source spans; sequence parse).
