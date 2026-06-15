# @m/parser — work log

- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- Added Chevrotain (catalog 12.0.0).
- Built the flowchart lexer (multi-mode for shapes/edge labels) and grammar in `src/shell`.
- Built CST→AST conversion returning `Result<FlowchartAst, ParseError>`, fail-loud on errors.
- Built the pure `print(ast)` printer in `src/core`.
- Added tests: printer unit + parse/round-trip/fail-loud integration (4 passing).
- Added `parseWithSource`: captures per-node id/label `TextSpan`s (the `SourceMap` contract) from
  Chevrotain token offsets, for two-way text patching. `parse` became an ast-only wrapper. +2 tests.
- Added `parseSequence`: a second Chevrotain lexer/grammar for `sequenceDiagram` (participants,
  messages, four arrow kinds; actors inferred from messages) → `SequenceAst`. +3 tests.
- Added `parseDiagram` (header-sniff routing → `DiagramAst`); both grammars now tolerate leading
  blank/comment lines before the header. +3 tests.
