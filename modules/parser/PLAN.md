# @m/parser — plan

`text → AST` and `AST → text` (printer) for Mermaid diagrams; round-trip tested.

## Responsibility

- Owns the grammars (one per family, Chevrotain) and the CST→AST conversion.
- Parsing untrusted source text is an I/O boundary, so it lives in `src/shell`; the printer is
  pure and lives in `src/core`.
- Does NOT do layout or rendering. Emits the `@m/contracts` AST only.

## Public API (stable surface)

- `parse(text: string): Result<FlowchartAst, ParseError>` — fail-loud, never throws.
- `print(ast: FlowchartAst): string` — pure.
- `ParseError = { kind: "parse"; errors: readonly string[] }`.

## Notes / known limits

- Direction must be a keyword right after `flowchart`/`graph`, else a node on the header line is
  mis-read as a direction. Source spans for two-way sync are not attached yet (see DO_NEXT).
