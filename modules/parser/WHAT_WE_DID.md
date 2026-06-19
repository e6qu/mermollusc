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
- Flowchart stadium `([…])` + circle `((…))` shapes: added `LStadium`/`LCircle` two-char openers
  (lexed before `LParen`, with their own lexer modes + closing tokens), two `shape` grammar ALTs, and
  `readNodeRef` cases → `shape: "stadium" | "circle"`. The printer + renderer already supported them,
  so they now round-trip; extended the round-trip property to all five shapes. +1 parse test.
- Flowchart `subgraph id [title] … end` grouping (nestable): added `Subgraph`/`End` keywords
  (`longer_alt: Identifier`), a `subgraphBlock` grammar rule, and `FlowchartAst.subgraphs`
  (`FlowSubgraph { id, label, parent, nodes }` in `@m/contracts`). Enabled `nodeLocationTracking`
  so `buildResult` processes statements + nested blocks in source order — a node is claimed by the
  subgraph it's declared in even if a later top-level edge references it — then emits a canonical
  node order (top-level first, subgraphs depth-first) that the printer mirrors so print→parse is a
  fixed point. Printer emits `subgraph` blocks. Layout/renderer don't consume subgraphs yet (next
  stage), so they currently lay out flat. +4 tests (membership, nesting+title, round-trip, print).
- print: pass the `FlowSubgraph` to `emitSubgraph` directly instead of re-`find`ing it by id,
  removing a dead `?? []` fallback (the subgraph always exists when emitting it).
- C4 elements accept Mermaid's optional description argument — `Person/System/Container(id, "label",
  "description")`. The grammar's element rule gained an `OPTION` for `, "descr"`; the CST→AST mapping
  reads the second quoted string into `C4Element.description` (null when omitted; the label span used
  for relabel still points at the first quoted string). Boundaries stay 2-arg. +1 integration test.
- Added a **state diagram** parser (`stateDiagram-v2` / `stateDiagram`): tokens (with a colon
  push-mode for trailing labels, like the sequence parser), grammar, and CST→AST + source spans
  (`parseState` / `parseStateWithSource`). Supports transitions `A --> B [: label]`, the `[*]`
  start/end pseudo-states (initial as a source, final as a target — merged to one `__state_start` /
  `__state_end` each), state descriptions `A : label`, and `state "Label" as A`. +3 integration tests.
- Extended the state parser with **composite states** `state X { … }` (recursive brace blocks):
  the grammar's `stateDecl` gained an optional block, and the CST→AST walk recurses with a scope
  stack — each scope (the root, or a composite) gets its own `[*]` pseudo-states (`__start`/`__end`
  at root, `__start__<id>`/`__end__<id>` inside a composite), and composites accumulate `StateAst.
  composites` (id/label/parent/members) mirroring `FlowSubgraph`. A composite id is a container, not
  a leaf state (filtered out of `states`). +1 integration test.
- Fixed `recognitionError`: an end-of-input error carries Chevrotain's EOF token, whose `startOffset`
  is `NaN` — that NaN was leaking into `ParseError.positions`, becoming a NaN highlight range that
  crashed the editor's lint on empty/truncated input. Non-finite positions are now filtered out (the
  message still surfaces; `positions` is the locatable subset). +1 unit case.
- Added an **ER diagram** parser (`erDiagram`): the crow's-foot relationship operator (`||--o{` etc.)
  is lexed as one token and split into normalised `fromCard`/`toCard` (`one`/`zeroOrOne`/`oneOrMany`/
  `zeroOrMany`) + identifying (`--`) vs non-identifying (`..`); entities come from relationship
  endpoints or bare declarations; quoted entity names and `: label` supported. +4 integration tests.
- Extended the ER parser with **attribute blocks** (`ENTITY { type name PK,FK "comment" … }`): added
  `{`/`}` tokens (ordered after `Relationship` so a leading `}` stays the cardinality operator) and a
  skipped comma; `block`/`attribute` grammar rules; the CST→AST step reads type + name + key
  identifiers (classified to `PK`/`FK`/`UK`) + an optional quoted comment into `ErEntity.attributes`.
  +1 integration test.
- Added a **class diagram** parser (`classDiagram`): class declarations with an optional `{ … }`
  member body (members captured as whole lines in a dedicated lexer mode, like the label modes), the
  `Foo : +member` shorthand, and relationship lines whose operator (`<|--`, `--|>`, `*--`, `o--`,
  `-->`, `..>`, `..|>`, `--`) is lexed whole and split into `fromArrow`/`toArrow` (`ClassArrow`) + a
  dashed flag (heads `<|`/`|>` triangle, `*`/`o` diamonds, `<`/`>` open arrow). Members split the
  visibility glyph from the text and detect `()` → method. +4 integration tests.
- Robustness pass: added a cross-family malformed/degenerate-input suite (`robust.test.ts`) that
  asserts `parseDiagram` **never throws** (always returns a `Result`) and parses every family's
  empty-body header — locking in the fail-loudly contract for header-only, truncated relationships,
  unclosed `{` blocks, self-references, 5k-char tokens, and unicode/emoji labels. No bug surfaced.
- Added a **requirement diagram** parser (`requirementDiagram`): entity declarations
  `requirement foo { key: value … }` / `element bar { … }` (body `key: value` lines captured whole in
  a body mode, split on the first `:`), and relationship lines `a - verb -> b` (or reversed
  `a <- verb - b`) where the verb is classified to one of the seven `ReqRelKind`s and the arrow
  direction sets from/to. The kind keyword is one `ReqKindKw` token (longest-alternative-first regex).
  +4 integration tests.
- Class stereotypes: a `<<interface>>` / `<<abstract>>` line in a class body now parses into
  `ClassEntity.stereotype` (the inner guillemet text; previously skipped). +1 integration assertion.
