# @m/parser — status

**State:** flowchart subset implemented; `make check` green.

- `parse(text)` → `Result<FlowchartAst, ParseError>` (shell): Chevrotain lexer+grammar → CST → AST, fail-loud on lex/parse/validation errors.
- `print(ast)` → text (core, pure).
- Supported: `flowchart|graph` + direction (TB/TD/BT/LR/RL), node shapes `[]`/`()`/`{}`, links `-->`/`---`/`-.->`/`==>`, edge labels `|...|`, `%%` comments, `;`/newline separators.
- tests: 4 passing (printer unit; parse + round-trip + fail-loud integration).
