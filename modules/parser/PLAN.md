# @m/parser — plan

`text → AST` and `AST → text` (printer) for Mermaid-like diagram families; round-trip tested where
the family has a printer.

## Responsibility

- Owns the grammars (one per family, Chevrotain) and the CST→AST conversion.
- Parsing untrusted source text is an I/O boundary, so it lives in `src/shell`; the printer is
  pure and lives in `src/core`.
- Does NOT do layout or rendering. Emits the `@m/contracts` AST only.

## Public API (stable surface)

- `parse(text: string): Result<FlowchartAst, ParseError>` and family-specific parsers such as
  `parseState`, `parsePie`, and `parseDiagram` — fail-loud, never throw.
- `print(ast: FlowchartAst): string` — pure.
- `ParseError = { kind: "parse"; errors: readonly string[]; positions: readonly ErrorPosition[] }`.

## Notes / known limits

- Direction must be a keyword right after `flowchart`/`graph`, else a node on the header line is
  mis-read as a direction.
