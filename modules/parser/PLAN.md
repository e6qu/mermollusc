# @m/parser — plan

`text → AST` and `AST → text` (printer) for Mermaid-like diagram families; round-trip tested where
the family has a printer.

## Gantt source maps

- Preserve edit spans for the full Gantt start field, not only explicit date tokens, so UI gestures can
  convert `after ...` tasks into explicit calendar starts from parser-provided provenance.

## Responsibility

- Owns the grammars (one per family, Chevrotain) and the CST→AST conversion.
- Parsing untrusted source text is an I/O boundary, so it lives in `src/shell`; the printer is
  pure and lives in `src/core`.
- Does NOT do layout or rendering. Emits the `@m/contracts` AST only.

## Public API (stable surface)

- `parse(text: string): Result<FlowchartAst, ParseError>` and family-specific parsers such as
  `parseState`, `parsePie`, and `parseDiagram` — fail-loud, never throw.
- `parseDiagramWithSource(text): Result<ParsedWithSource, ParseError>` — header-sniffs once and routes
  to the family's source-capturing parser, returning `{ family, ast, source }` in a single pass.
  `ParsedWithSource` is a discriminated union tagged by `family` (a closed union), *not* `ast.kind`,
  so flowchart-from-DOT (both `ast.kind === "flowchart"`) stay distinguishable (`family: "flowchart"`
  vs `"dot"`). DOT has no source parser, so it carries an empty `SourceMap`.
- `print(ast: FlowchartAst): string` — pure.
- `ParseError = { kind: "parse"; errors: readonly string[]; positions: readonly ErrorPosition[] }`.

## Shell CST adapter

`src/shell/cst.ts` is the one place the chevrotain CST-access casts live: it exports `Children`
(the labelled-children dict type), `childTokens`/`childNodes` (the sanctioned `as IToken[]`/`as
CstNode[]` recoveries), `imageOf`, and `spanOf`. All family parse files import these by name rather
than re-declaring them. The CST is chevrotain's own typed union (not external `unknown`), so it does
*not* route through `decode()`; an absent optional child stays `[]` (the correct value), not a
`Result`.

## Notes / known limits

- Direction must be a keyword right after `flowchart`/`graph`, else a node on the header line is
  mis-read as a direction.
