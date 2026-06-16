# @m/layout — work log

- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- Confirmed `elkjs@0.11.1` ships its own TypeScript types (`lib/elk-api.d.ts`); used the bundled
  node-safe entry `elkjs/lib/elk.bundled.js`.
- core: `toElkGraph` (FlowchartAst → ELK graph spec, layered, direction-mapped, heuristic node
  sizing) and `toScene` (decoded ELK result → branded `Scene`, fail-loud on AST mismatch).
- shell: `layout()` runs ELK and decodes its result via a Zod schema before handing to core.
- Added relax: `layout(ast, seed)` seeds node positions and runs ELK semi-interactive layered
  layout (verified empirically — a flipped seed flips the result). Replaced the string-keyed ELK
  option dict in core with a typed `LayoutConfig`; the option bag is assembled in the shell.
- tests: unit (toElkGraph/toScene) + integration (clean layout, relax) — 5 passing.
- Added `layoutSequence` (pure, no ELK): lane layout — actors row, vertical dashed lifelines
  (reusing SceneEdge self-edges), messages as horizontal arrows styled by `MessageKind`. +3 tests.
- Added `layoutDiagram(ast)` routing by `ast.kind` (flowchart → ELK, sequence → lane). +1 test.
- Added `layoutC4` (pure recursive nested-box layout: boundaries sized to wrap children,
  straight centre-to-centre relation edges); `layoutDiagram` routes C4. +3 tests.
- Added `layoutBlock` (pure row-major grid in a uniform cell sized to the widest label; straight
  centre-to-centre edges); `layoutDiagram` routes block. +3 tests.
- Added `layoutNetwork` (pure squarish-grid layout; undirected arrowless centre-to-centre links);
  `layoutDiagram` routes network. +2 tests.
- Added property-based tests (fast-check): block/network layouts preserve node identity and fit
  every box inside the reported extent. +2 tests.
- Added `layoutCloud` (pure recursive nested-box, modelled on `layoutC4`): groups → container
  boxes wrapping children, service leaves get a kind `icon` ref, undirected links. +3 tests.
- Added a property-based test (fast-check, async) over the ELK flowchart path: generated ASTs lay
  out with all node ids preserved and every box inside the reported extent. +1 test.
- Added an injectable `MeasureText` (default = the char-width heuristic) threaded through every
  layout + `layoutDiagram`/`layout`, so the app can size nodes with real canvas `measureText`. +1 test.
- Mapped cloud service kinds to representative vendored simple-icons glyphs (compute→docker,
  storage→googlecloudstorage, database→postgresql, queue→apachekafka, cdn→cloudflare).
- `layoutNetwork` now honours a `NetworkNode.icon` override (falls back to the kind's arch glyph).
