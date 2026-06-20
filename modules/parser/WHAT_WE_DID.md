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
- Fixed external-review P1 (cloud group-id collision): synthetic cloud group ids are now `group:N`
  instead of `gN`. The `:` is outside the `CloudIdentifier` space (`[A-Za-z0-9_]+`), so a user service
  named `g0` can no longer collide with the first group and overwrite its box / hit-test / source
  identity. +1 unit regression test.
- Fixed external-review P1 (malformed icon refs silently nulled): extracted the three duplicated
  `parseIconRef` copies into a shared `iconRefOf` returning `Result<IconRef, string>`; net/block/cloud
  now fail the parse with a token-located error (new `parseErrorAt` helper) instead of dropping a bad
  `icon "…"` ref to `null` and rendering a default glyph — honouring the fail-loudly contract. Flipped
  the three "ignores malformed icon" unit tests to assert the loud failure.
- Fixed external-review P2 (requirement verb not editable): `parseRequirementWithSource` now captures
  each relationship verb's token span into `ReqSource.relationships`, enabling inline edit of the verb
  (round-trips to another of the seven; invalid fails the parse loudly). +1 unit test.
- Added a **gitGraph** parser (`git-tokens.ts`/`git-grammar.ts`/`git-parse.ts`): an optional
  `LR`/`TB`/`BT` header direction, then `commit`/`branch`/`checkout`/`switch`/`merge` commands with
  `id:`/`tag:`/`type:` (NORMAL/REVERSE/HIGHLIGHT) attributes. `buildResult` interprets the command
  stream into a resolved commit graph: it tracks the current branch (Mermaid's `branch` creates **and**
  checks out), seeds `main` as lane 0, resolves each commit's parents (previous tip on its branch; two
  parents for a merge — current tip + merged tip), and mints ids (explicit `id:` must be unique — a
  duplicate fails loudly; absent ones get the first free `cN`, so synthetics never shadow explicits).
  Checkout/merge of an unknown branch and a self-merge fail loudly with a located error.
  `parseGitGraphWithSource` captures explicit-id spans (`GitGraphSource`) for inline relabel. +8 tests;
  `parseDiagram` routes `gitGraph` headers; added to the robustness suite.
- Added a **timeline** parser (`timeline-{tokens,grammar,parse}.ts`): `title`, `section` groupings, and
  `period : event : event` lines, with events also attaching via `:`-continuation lines. A two-mode
  lexer (a `start` mode for the line head, a `body` mode for the colon-separated text after it) keeps
  `timeline`/`title`/`section` as keywords only at the line head while period/event text holds spaces
  and arbitrary words (a period like `titles released` stays free text via the keyword `\b`).
  `buildResult` carries the current `section` onto each period, attaches continuation events to the
  previous period (a `:` before any period fails loudly), and reads `title`/`section` values straight
  from the source slice so colons in them survive. `parseTimelineWithSource` records trimmed period +
  event spans (`TimelineSource`). +8 tests; `parseDiagram` routes `timeline`; added to robustness suite.
- Added a **mindmap** parser (`mindmap-{tokens,grammar,parse}.ts`): indentation-defined hierarchy, the
  shapes (`[square]`/`(rounded)`/`((circle))`/`{{hexagon}}`/plain), and `::icon()`/`:::class`
  decorations (parsed then stripped — no icon pack here). Chevrotain doesn't model indentation, so the
  lexer skips leading whitespace and captures each line as one `LineText` whose `startColumn` *is* its
  indentation; `buildResult` rebuilds the tree with an indentation stack (pop ancestors at the same or
  deeper column, the nearest strictly-shallower node is the parent), reads the shape from the delimiter,
  and records each node's label span (`MindmapSource`). +6 tests; `parseDiagram` routes `mindmap`; added
  to the robustness suite.
- Added a **pie** parser (`pie-{tokens,grammar,parse}.ts`): `pie [showData]`, an optional `title`, and
  `"label" : value` data rows. A two-mode lexer reads the unquoted title (pushed into a `titleMode`
  whose newline pops back) without it clashing with quoted labels / numeric values. `buildResult`
  collects slices in source order and **fails loudly on a non-positive value** (zero reaches the parser;
  a leading `-` isn't a numeric literal, so the lexer already rejects negatives). `parsePieWithSource`
  records each label span (`PieSource`). +5 tests; `parseDiagram` routes `pie`; added to robustness.
- Added **DOT (Graphviz) import** (`dot-{tokens,grammar,parse}.ts`): `parseDot` parses a `[strict]
  (graph|digraph) [id] { … }` subset — node statements, edge statements incl. `a -> b -> c` chains,
  `node`/`graph`/`edge` default-attr statements, `ID = ID` graph attrs — and produces a **`FlowchartAst`**
  (not a new family), so it renders through the existing flowchart pipeline with no downstream changes.
  Maps `shape`→`NodeShape`, `rankdir`→`FlowDirection`, edge `style`→`EdgeKind`; `digraph` edges get
  arrowheads, `graph` (`--`) edges don't. The lexer skips DOT's free-form whitespace + `//`/`#`/`/* */`
  comments. `parseDiagram` routes `digraph`/`strict`, and `graph` only when its header line has `{` (so
  Mermaid's `graph TD` decision-node `{…}` isn't mistaken for DOT). Subgraphs/ports/HTML labels are out
  of scope (fail loudly). +9 tests; added to the robustness suite.
- DOT import now handles **subgraphs/clusters**: the grammar gained a recursive `subgraph [id] { … }` /
  anonymous `{ … }` statement, and `buildResult` walks it with an enclosing-cluster context. A
  `cluster*`-prefixed subgraph becomes a `FlowSubgraph` (a box — label from its `label=` attr, nested
  via `parent`); a non-`cluster` subgraph is transparent (its nodes/edges import, no box), matching
  Graphviz. Node membership is fixed at first sighting (DOT scoping). +2 tests; real clustered DOT now
  imports and renders through the flowchart ELK container path.
- Deferred-backlog batch: **timeline `<br>`** soft line breaks (period/event text → newlines; the
  layout grows the cell per line); **class generics** `~T~` → `<T>` for display (ids keep the raw form
  so relationship endpoints still match — the class-name token gained an optional `~…~` suffix);
  **state `<<fork>>`/`<<join>>`/`<<choice>>`** annotations (a new `StateAnnotation` token + an optional
  slot in `stateDecl`) set the state's kind; **DOT cluster import** already shipped, now complemented by
  export. +tests across timeline/class/state/dot.
- class **per-end multiplicity** (`Customer "1" --> "*" Order`): the relationship rule takes optional
  quoted strings around the operator → `ClassRel.fromMult`/`toMult` (positioned by offset vs the
  operator). state **notes** (`note right of`/`left of`/`over X : text`): new note keyword tokens + a
  `noteStmt` rule → `StateAst.notes`. +tests; both added to the robustness suite.
- Audit-sweep fixes: **requirement** parser now **fails loudly** on an unknown relationship verb (was a
  silent `continue` that contradicted its own comment); **ER** merges multiple `ENTITY { … }` blocks
  for one entity instead of overwriting (silent data loss); **block** strips quotes from a quoted pipe
  edge label (was keeping them, desyncing label vs span); **DOT** lowercases the `style` value before
  matching; **mindmap** relabel-span search starts at the shape delimiter so an id that repeats the
  label text doesn't point the span at the wrong occurrence. +tests (incl. the req "fails loudly" test,
  which previously exercised a lexer error rather than the verb path).
- Refined-number brands: `pie-parse` mints `PieSlice.value` via `positive()` (right after its existing
  `> 0` check) and `block-parse` mints `BlockAst.columns` via `positiveInt(max(1, trunc(requested)))`
  (the columns decl is now read defensively, so a non-finite value falls back to ≥1 rather than a NaN
  grid width). The invariants the parser already enforced at runtime are now carried in the types.
- The flowchart source map now records each node's `decl` span (id + shape brackets), computed per
  shape from the inner label span + the closing-delimiter length, so the builder can reshape a node
  (rewrite its brackets) in place.
