# @m/parser — status

**State:** flowchart subset + source spans implemented; `make check` green.

- `parse(text)` → `Result<FlowchartAst, ParseError>` (shell): Chevrotain lexer+grammar → CST → AST.
- `parseWithSource(text)` → `Result<{ ast, source: SourceMap }, ParseError>`: also returns per-node
  id/label text spans (for the builder's two-way patching). `parse` is the ast-only wrapper.
- `print(ast)` → text (core, pure); round-trip tested.
- Supported: `flowchart|graph` + direction, shapes `[]`/`()`/`{}`, links `-->`/`---`/`-.->`/`==>`,
  edge labels `|...|`, `%%` comments, `;`/newline separators.
- tests: 6 passing (printer; parse + round-trip + fail-loud; source spans).
