# @m/parser — work log


## 2026-07-05 — Write-side linkStyleSpans for state/er/block/network/cloud/class

- New shared `singleLinkStyleIndex` helper (extends `style-spans.ts`) captures a single-index
  `linkStyle <n>` span; flowchart refactored onto it. Each edge-bearing family now captures
  `linkStyleSpans` (keyed by declaration index), so the editor can rewrite/remove an edge's colour in
  place — the write-side counterpart of the read-side `linkStyle` resolution.

## 2026-07-05 — Write-side styleSpans for ER/block/network/cloud/class

- Each of these families now captures `styleSpans` (single-target `style <id>` line spans) via the shared
  `singleStyleTarget` helper, so the editor can rewrite/remove a node's colour in place. c4
  (`UpdateElementStyle`) and mindmap (generated ids) are excluded — they need a different write format.

## 2026-07-05 — Write-side begins: shared style-span helper + state styleSpans

- Extracted `singleStyleTarget` (in `style-spans.ts`): the single-target `style <id>`/`linkStyle <n>`
  span-capture rule in ONE place (multi-target/`default` → null). Refactored flowchart's `collectStyles`
  to use it. State now captures `StateSource.styleSpans`, so the editor can rewrite/remove a state's
  colour in place — the first family beyond flowchart with source-colour WRITE support.

## 2026-07-05 — C4 styling (UpdateElementStyle → style)

- C4 diagrams accept `UpdateElementStyle(id, $bgColor="…", $borderColor="…")` and `UpdateRelStyle(…)`.
  New `$name`/`=` tokens and grammar rules; the parser maps `$bgColor`→fill and `$borderColor`→stroke
  into a synthesised `style <id> …` directive on `C4Ast.styles` (`$fontColor` accepted but dropped — no
  text-colour in the shared model). `UpdateRelStyle` is accepted (no crash) but not colour-rendered.
  Eighth "other family" — the last with genuine Mermaid styling syntax.

## 2026-07-05 — Class-diagram styling (keyword-collision family)

- Class diagrams support styling now, without touching the `class Foo` DECLARATION keyword. Added the
  whole-line `classDef`/`style`/`linkStyle` directives (before `ClassKw` so `classDef` isn't a decl), the
  `cssClass "A,B" name` statement, and inline `:::name` on class refs (token before `Colon` so the `:::`
  isn't split into label mode). Assignment is synthesised into `class <id> <name>` from `cssClass`/`:::` —
  never a bare `class A name`, which would collide with a declaration. A right-only `:::` on a relationship
  is attached to the right endpoint by source offset (not by token index). Captured on `ClassAst.styles`.
  Seventh "other family" — the hard one.

## 2026-07-05 — Mindmap styling (line-based, generated ids)

- Mindmap's lexer captures each line whole, so a `classDef`/`style`/`linkStyle` line would have become a
  node. The parser now recognises those (anchored, colon-bearing patterns — unambiguous vs node text) as
  directives, and turns an inline `:::name` on a node into a synthesised `class <generatedId> name` (node
  ids are generated). Captured on `MindmapAst.styles`. Sixth "other family".

## 2026-07-05 — Cloud-diagram styling (shared patterns)

- The cloud parser now accepts `style`/`classDef`/`class`/`linkStyle` directives (shared tokens, before
  `Identifier`), captured on `CloudAst.styles`. Fifth "other family" (network's sibling).

## 2026-07-05 — Network-diagram styling (shared patterns)

- The network parser now accepts `style`/`classDef`/`class`/`linkStyle` directives (shared tokens, before
  `Identifier`), captured on `NetworkAst.styles` and applied by the shared resolver. Fourth "other family".

## 2026-07-04 — Block-diagram styling (shared patterns)

- The block-beta parser now accepts `style`/`classDef`/`class`/`linkStyle` directives (shared tokens,
  before `Identifier` so a directive line isn't read as bare blocks), capturing them on `BlockAst.styles`.
  Previously a `classDef` broke the whole block parse. Third "other family".

## 2026-07-04 — ER-diagram styling (shared patterns)

- The ER parser now accepts `style`/`classDef`/`class`/`linkStyle` directives (shared `style-patterns.ts`
  tokens, before `Colon` so a `fill:…` colon doesn't push label mode), capturing them on `ErAst.styles`.
  Previously a `classDef` broke the whole ER parse. Second "other family" after state.

## 2026-07-04 — looksLikeDiagramHeader

- New `looksLikeDiagramHeader(text)` — true when the first meaningful line is a diagram header (same
  keyword set `parseDiagram` dispatches on, plus flowchart's `flowchart`/`graph`). Lets the editor tell
  a whole-diagram paste from a snippet.

## 2026-07-04 — State-diagram styling (shared patterns)

- Extracted the 5 Mermaid style/`:::` lexer patterns to a shared `style-patterns.ts` (single source of
  truth for the compliance rules), used by both the flowchart and state lexers. The STATE parser now
  accepts `style`/`classDef`/`class`/`linkStyle` directives and the inline `:::class` on transition
  endpoints, capturing them on `StateAst.styles` (resolved by the shared style resolver). Previously a
  `classDef`/`class`/`:::` broke the whole state parse. Style tokens sit before `Colon` in the state
  lexer so a `fill:…`/`:::` colon doesn't trigger label mode.

## 2026-07-04 — Inline `:::class` shorthand

- The lexer/grammar now accept Mermaid's inline `id:::className` (and `id[label]:::className`) class
  shorthand; the AST builder synthesises an equivalent `class id className` directive so the colour
  resolver + printer treat it uniformly. Previously a `:::` broke the whole parse.

## 2026-07-04 — classDef/linkStyle default resolvers

- New `resolveDefaultNodeStyle`/`resolveDefaultLinkStyle` expose a `classDef default …` / `linkStyle
  default …` colour (Mermaid applies these to EVERY node/edge that has no more specific style). Returned
  separately so the caller (which has the node/edge list) fans them out.

## 2026-07-04 — Style-directive compliance fixes (review)

- `parseProps` splits property lists only on TOP-LEVEL commas, so a value with internal commas
  (`fill:rgb(1,2,3)`) survives. A new `splitProps` finds the property list by its first `key:`, so a
  target list may contain whitespace (`linkStyle 0, 1 stroke:…` now resolves every index + keeps the
  colour). Lexer: class/classDef names allow `-` (hyphenated names no longer fail the whole parse); the
  directive tokens stop at `;` so a `;`-separated statement after a style line isn't swallowed.

## 2026-07-04 — Edge endpoint spans

- The parser records `edgeEnds` (each edge's from/to endpoint declaration spans) for reconnection. A
  chain (`A --> B --> C`) reuses the middle node's single token, so the two edges share that span — which
  the editor uses to decline a reconnect that would move both.

## 2026-07-04 — Subgraph block spans

- The parser records `subgraphSpans` (the `subgraph … end` block span per subgraph id) from the block
  CST node's location, for source-based ungrouping.

## 2026-07-04 — Resolve + locate linkStyle (edge colour)

- New `resolveLinkStyles(styles)` → per-edge-index `{stroke}` from `linkStyle <n> stroke:…` directives
  (`default`/non-numeric ignored). The parser also records `linkStyleSpans` for single-index lines.

## 2026-07-04 — Expose single-target style-line spans

- The flowchart parser now records `styleSpans` (per-node directive-token span for single-target inline
  `style` lines) in the source map, for in-place editing. DOT import supplies an empty map.

## 2026-07-04 — Resolve Mermaid node styles to colours

- New pure `resolveNodeStyles(styles)` turns the verbatim `FlowchartAst.styles` directives into a
  per-node `{fill, stroke}` map (keyed by raw id string): `classDef`+`class` applied first, inline
  `style` overriding, `linkStyle` ignored (edges). Raw colours pass through unchanged (a hand-written
  `fill:#123456` is faithful — no lossy accent snap).

## 2026-07-04 — Accept + round-trip Mermaid styling directives

- The lexer/grammar now ACCEPT `style`/`classDef`/`class`/`linkStyle` directives (previously they failed
  to parse, so pasting real-world Mermaid with colours broke). Each is a whole-line token with a
  structure-specific pattern, so it can't swallow a node ref that merely starts with the keyword
  (`style --> B`). The AST builder captures them verbatim on `FlowchartAst.styles`, and the printer
  re-emits them, so an edit never silently drops a style line (print→parse stays a fixed point).
- DOT import + the state→flow bridge set `styles: []` (neither dialect has Mermaid style syntax).
- Rendering the colours + routing the colour swatch to write these directives are the next steps.
- State diagrams now parse `direction TB|TD|BT|LR|RL` into `StateAst.direction`; invalid values return
  a located parse error instead of being ignored or silently defaulted.

## 2026-06-30 — Gantt start-field spans

- Captured the full source span for every parsed Gantt task start field.
- Kept explicit date spans separate so existing date-shift edits and dependency materialization use the
  correct span.
- Preserved DOT `style=rounded` on box-like nodes during import so export→import→export reaches a stable
  fixed point for richer examples with rounded/composite nodes.

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
- Robustness: the canonical node-order walk appends a subgraph's node ids with a loop, not
  `push(...s.nodes)` — a spread of a very large subgraph would exceed the argument-count limit and throw.
- New family (Gantt) — parser. `parseGantt`/`parseGanttWithSource` (`gantt-tokens`/`-grammar`/`-parse`)
  mirror the timeline's two-mode lexer: a leading keyword (`gantt`/`title`/`dateFormat`/`section`) or a
  task label (text up to the first `:`) opens the line body. The task meta after the `:` is
  comma-separated and interpreted positionally — trailing `duration` (`5d`/`2w`/bare = days), preceding
  `start` (a date string or `after <id>`), and leading `status`/`id` tags. Fails loudly on a task with
  no start+duration or an unparseable duration; tracks each task's label span for later inline editing.
  +5 integration tests. (Standalone for now — not yet wired into `parseDiagram`.)
- Gantt: **milestones**. A task tagged `milestone` is a point (`0d`); `parseGantt` now accepts a `0d`
  duration only for a milestone (an ordinary task with `0d` fails loudly) and sets `GanttTask.milestone`.
  +2 tests (a milestone parses to `durationDays: 0`; a non-milestone `0d` is rejected).
- Gantt `after a b c`: parse the whole start field, split on whitespace into one-or-more predecessor
  ids minted through `oneOrMore`, and fail loudly on an empty `after`. +1 test (two refs → `["a","b"]`).
- Gantt `excludes` directive: new `Excludes` keyword token + `excludesLine` grammar rule; the value is
  split on whitespace/commas into the literal `weekends` (→ `excludesWeekends`) and date strings (→
  `excludeDates`). +2 tests (weekends + holidays parsed; default empty when absent).
- Gantt `tickInterval` directive: new `TickInterval` keyword token + `tickIntervalLine` rule; the value
  parses as `<n>[day|week]` (a bare number is days, week = 7) to a `PositiveInt`, defaulting to 7 when
  absent and failing loudly on an unsupported unit (e.g. `month`). +2 tests.
- Requirement field validation: `fieldOf` now returns a `Result` and validates each body line against
  the closed `ReqField` — `risk`/`verifymethod` matched case-insensitively to their canonical lowercase
  union member, an unknown key or out-of-domain value failing loudly (located error) rather than being
  kept as free text. +3 tests (case-normalised ok; bad risk located; bad method / unknown key fail).
- Gantt dates now minted through `ganttDate` at the parse boundary — a task start date and each
  `excludes` holiday are validated there, failing the parse loudly (located) on a bad format or
  non-calendar day, instead of the layout catching it later. +2 tests (bad start date; bad holiday).
- State notes now parse their requested side (`note right of`, `note left of`, `note over`) into
  `StateNote.side`; the default stays `right` because that is the token-free form already accepted by
  the grammar.
- Pie headers now accept a local `donut` modifier alongside `showData` (`pie donut`, `pie showData
  donut`, or the reverse order), and `PieAst.donut` carries that through the pipeline. +integration test.
- Centralised the CST-access boundary: new `src/shell/cst.ts` is the single commented shell adapter
  exporting `Children`, `childTokens`, `childNodes`, `imageOf`, `spanOf`. The ~16 sibling parse files
  each used to re-declare a local `Children` dict type plus the `as IToken[]`/`as CstNode[]` casts
  (~31 casts, 16 copies); they now import the helpers by name. Pure DRY — the `?? []` idiom is kept
  (an absent optional child is `[]`, the correct value, not a `Result`), and CST access stays out of
  `decode()` (the CST is chevrotain's own typed union, not external `unknown`). The two sanctioned `as`
  casts now live in one place. +`cst.test.ts` (fast-check parity: the centralised helpers vs the old
  inline casts on arbitrary children dicts + real lexer tokens).
- `parseDiagram` header sniff: replaced the whole-document `split/map/find` with a forward line-scan
  (`firstMeaningfulLine`) that stops at the first trimmed non-empty, non-`%%` line — no longer trims
  the entire document on every parse. `trim()`'s `\r`-stripping behaviour is preserved exactly.
  +fast-check parity test (vs the old logic on arbitrary inputs) + hand-picked CRLF/comment/no-trailing-
  newline cases.
- Subgraph ordering O(S²)→O(S): the canonical-order walk used to rescan every subgraph at each
  recursion level. Now a single pass buckets the subgraphs into `Map<NodeId|null, FlowSubgraph[]>` by
  `parent` (insertion order preserved within each bucket), and `walk` reads its bucket directly. Output
  is byte-identical (kept the `for…push`, no spread). +a depth-first nested/sibling-subgraph ordering
  golden (+ print→parse fixed-point assertion).
- New `parseDiagramWithSource(text): Result<ParsedWithSource, ParseError>` (+ exported `ParsedWithSource`
  type): the same header sniff, but routes to each family's `*WithSource` parser so one pass yields both
  the AST and the editable source spans — the app previously parsed every family twice (ast-only to
  detect the family, then again for the source map). `ParsedWithSource` is a clean discriminated union
  tagged by a **dedicated `family`** field (a closed union), because both `parse` and `parseDot` yield
  `ast.kind === "flowchart"` — only `family` (`"flowchart"` vs `"dot"`) distinguishes them; every other
  family's `family` equals its `ast.kind`. DOT has no source-span parser, so its variant carries an
  empty `SourceMap`. All existing exports keep working. +`diagram-source.test.ts` (per-family tag +
  one-pass AST parity with `parseDiagram` + DOT/flowchart discrimination + a flowchart-span check + a
  fail-loud case).
- Grouping grammar: block `block:id … end` composites + column spans (`a:N`/`block:id:N`); network
  `group "…" { }` subnet/zone groups (recursive, synthetic `group:N` ids). Block composite-id collisions
  (with a leaf or another composite) fail loud. Bare-node relabel + group label spans recorded.
- Totality: the flowchart `walk` that emits canonical node order recursed forever on two `subgraph X`
  blocks sharing an id (one nested in the other) — added an on-path visited guard so a malformed
  duplicate is emitted once, not infinitely. Found by the parse→layout→render fuzz.
- Sequence notes: lexer/grammar/AST for `note (left of|right of|over) <actors> : text` (the `:` reuses
  the message text mode; `over A,B` spans two actors). Each note records `after` = messages seen so far
  (its interleave position) and a text span for two-way editing. Actors referenced only by a note are
  inferred like message endpoints.
- Capture each flowchart/block edge's arrow-token span in the source map (`arrows`), enabling edge
  restyle + bare-edge labelling.
- ER/class relationship labels now strip surrounding quotes (like their endpoint labels already did) and
  point the relabel span at the inner text — `A ||--o{ B : "places many"` stored/edited as `places many`,
  not `"places many"`.
- Capture sequence message arrow-token spans (`arrows`) in the parsed `SequenceSource` map, enabling sequence edge style cycling.
- Class diagram stereotype parsing: added a new `ClassStereotype` token (`<<...>>`) and supported parsing class header stereotypes (e.g., `class Foo <<interface>>`) as well as standalone stereotype declarations (e.g., `<<service>> CustomerService`). Integrated these with the parser source map.
