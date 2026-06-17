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
- `toElkGraph` now sizes `circle` flowchart nodes square (side = max(label width, node height)) so
  the renderer's `min(w,h)/2` corner-rounding yields an actual circle; other shapes stay wide boxes.
  +1 transform test.
- Subgraph hierarchy: `toElkGraph` nests `FlowchartAst.subgraphs` as ELK compound nodes (members +
  nested subgraphs as children, with title padding); the shell sets `hierarchyHandling:
  INCLUDE_CHILDREN`, decodes ELK's recursive result, and flattens parent-relative child coordinates
  to absolutes (`PositionedNode.parent`). `toScene` synthesises a `container`-shape SceneNode per
  subgraph with members parented to it — the renderer's existing C4 `container` draws it, so no
  renderer change was needed. Modelled `LayoutNode` as a `Leaf | Container` discriminated union so
  illegal states (leaf-with-children, sized-container) can't be built. +1 integration test
  (container synthesis + absolute containment).
- Fixed `make build` repo-wide: tsup's .d.ts step injects a `baseUrl` (to resolve `paths`) that TS
  6.0 deprecates (TS5101); added `"ignoreDeprecations": "6.0"` to `tsconfig.base.json`.
- Explicitness / de-fallback pass: made `measure` a **required** param on every layout
  (`layout`/`layoutDiagram`/`layoutSequence`/`C4`/`Block`/`Network`/`Cloud`/`toElkGraph`) and `seed`
  required on `layout`/`toElkGraph` — no defaults, so callers state intent (the now-dead `seed`
  default fell out once `measure` was required). Exported `heuristicMeasure` from the package for
  callers wanting the char-width metric. Removed a cleanly-dead fallback in `layoutSequence` by
  building each lifeline in the actor loop from the known centre (no second Map lookup / `?? 0`).
  (Remaining: the message-endpoint and cloud/c4 `boxes.get` `?? default` defend pure layouts against
  inconsistent ASTs — removing them properly means making those layouts return `Result`.)
