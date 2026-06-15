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
- Added `parseSequenceWithSource`: captures message-text and actor-label spans (`SequenceSource`)
  for sequence two-way editing; `parseSequence` is now the ast-only wrapper. +1 test.
- Added `parseC4`: a third Chevrotain lexer/grammar for the C4 subset with recursive `Boundary`
  nesting (CST→`C4Ast` sets each element's `parent`); `parseDiagram` routes `C4*` headers. +3 tests.
- Added `parseC4WithSource`: captures inner-label `TextSpan`s for every element (incl. nested
  boundary children) and relation (`C4Source`), for C4 two-way editing; `parseC4` is now the
  ast-only wrapper. +3 tests.
- Added `parseBlock`: a fourth Chevrotain lexer/grammar for the `block-beta` subset — `columns N`
  directive plus block declarations and edge chains reusing the flowchart shape/link syntax
  (block labels unquoted); `parseDiagram` routes `block*` headers. +3 tests.
- Added `parseBlockWithSource`: captures label `TextSpan`s (inner-of-quotes, whitespace-trimmed)
  for explicitly-labelled blocks and pipe-labelled edges (`BlockSource`), for block two-way
  editing; `parseBlock` is now the ast-only wrapper. +3 tests.
