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
- Added `parseNetwork` / `parseNetworkWithSource`: a fifth (single-mode) Chevrotain lexer/grammar
  for the `network` subset — kind-typed nodes (kinds are keyword tokens) and undirected `--` links,
  with inner-label spans (`NetworkSource`); `parseDiagram` routes `network*` headers. +3 tests.
- Added a property-based round-trip (fast-check): generate flowchart ASTs (safe labels, parser-
  reproducible shapes, `n*`/`e*` ids) and assert `parse(print(ast)) === ast`. +1 test.
- Added `parseCloud`: a sixth Chevrotain lexer/grammar for the `cloud` subset — recursive
  `group "label" { … }` (synthetic `g*` ids), kind-typed service leaves, undirected `--` links;
  `parseDiagram` routes `cloud*` headers. +3 tests.
- Added `parseCloudWithSource`: inner-label `TextSpan`s for groups, leaves, and links (`CloudSource`)
  for cloud two-way editing; `parseCloud` is now the ast-only wrapper. +1 test.
- Network: added an optional per-node `icon "<pack>/<name>"` override (an `Icon` keyword + a second
  quoted string) → `NetworkNode.icon: IconRef | null`; malformed refs parse to null. +2 tests.
- Cloud: same per-leaf `icon "<pack>/<name>"` override → `CloudNode.icon` (layout prefers it over the
  kind→simple-icons default). +1 test.
- Block: same per-node `icon "<pack>/<name>"` override → `BlockNode.icon` (added an `Icon` keyword +
  a `BlockQuoted` token to the block lexer's main mode); layout draws it. +1 test.
- Flowchart: `SourceMap` now carries per-edge `|label|` spans (trimmed) so edge labels are two-way
  editable; `parseWithSource` captures them from the link's `PipeText` token. +1 test.
- `ParseError` gained `positions: ErrorPosition[]` (`{ offset, length }`). Extracted the error
  construction into a shared `parse-error.ts` (`lexingError` from Chevrotain `ILexingError.offset/
  length`, `recognitionError` from the recognition exception's `token.startOffset`/image length,
  `parseError` for located-less structural checks) and routed all six parsers through it. Lets a host
  highlight the failing range; line/col are the host's to derive. +2 tests (lex + recognition spans).
