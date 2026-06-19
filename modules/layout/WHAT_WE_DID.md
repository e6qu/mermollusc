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
- Type-safety pass (kill stringy/magic): branded the flowchart layout boundary — `LeafNode`/
  `ContainerNode`/`PositionedNode` ids are `NodeId`, `LayoutEdge`/`PositionedEdge` ids `EdgeId`,
  `PositionedNode.parent` `NodeId | null` (branding happens at the ELK decode boundary in the shell).
  Keyed every internal layout `Map<string, …>` by its domain brand instead (`NodeId`/`EdgeId`/
  `C4ElementId`/`ActorId`) across transform/c4/cloud/sequence/block/network. Replaced the scattered
  magic pack-id literals (`"arch"`, `"simpleicons"`) with named constants in a new `icon-packs.ts`
  (icon *names* stay as data; the literals must match @m/icons, a sibling we can't import — the icon
  ref is the shared contract).
- Made the five pure layouts total-by-`Result`: `layoutSequence`/`layoutC4`/`layoutCloud`/
  `layoutBlock`/`layoutNetwork` now return `Result<Scene, LayoutError>` and fail loudly when the AST
  is internally inconsistent — an edge/relation/message/link endpoint that isn't a known node, or
  (c4/cloud) an element whose `parent` is dangling or cyclic so it was never placed. This removes the
  silent `?? 0` (phantom x=0 arrow), `?? {default box}` (orphan stacked at the origin), and
  dropped-edge `continue` fallbacks. The idiomatic `?? []` multimap accumulation stays — an empty
  child list is a valid state, not a masked error. The shell dispatcher returns each `Result`
  directly (no more `ok()` wrapping). +7 fail-loudly unit cases.
- C4 layout now renders an element's description as a second label line: the scene label is composed
  as `label\ndescription` (null description → unchanged), and the leaf box is sized to the widest
  line. Relies on the renderer's new multi-line label handling. +1 unit case.
- Routed **state diagrams** through the existing ELK path: a `stateToFlow` adapter in the shell maps
  `StateAst` to a `FlowchartAst` (states → round nodes, `[*]` pseudo-states → circles, transitions →
  arrowed edges; ids re-branded at the shell boundary), so `layoutDiagram` lays state out with the
  same layered layout + `toScene` as flowcharts. +1 integration test.
- Composite states ride the flowchart subgraph path: `stateToFlow` now maps `StateAst.composites` to
  `FlowSubgraph`s (id/label/parent/members), so ELK nests them as containers — no new layout code.
- ER diagrams ride the ELK path too: an `erToFlow` adapter maps entities → rect nodes and
  relationships → unarrowed edges (solid for identifying, dashed for non-identifying) whose label
  carries the cardinality textually (`1 places *`).
- Reworked ER layout into a dedicated `layoutEr` (replacing `erToFlow`): entities must be sized to fit
  their attribute rows before ELK runs (a flowchart node can't carry rows), so it builds the ELK graph
  directly — each entity box is `ER_TITLE_H + rows·ER_ROW_H` tall and as wide as its widest measured
  row/label. Scene edges now carry the cardinality on `fromEnd`/`toEnd` (the `ErCardinality` strings
  *are* `EdgeEnd` values — no mapping) and entities carry their `rows`; the verb is the plain edge
  label. Migrated every family's node/edge producers to `SceneNode.rows` + `SceneEdge.fromEnd/toEnd`.
- Added `layoutClass` (UML class diagrams), mirroring `layoutEr` — entity boxes sized to fit their
  members and laid out through ELK directly. Members are split into fields then methods (two
  compartments via `SceneNode.rowDivider` = the field count) and `memberRow` prefixes the visibility
  glyph (`+`/`-`/`#`/`~`). Relationship ends carry the UML arrowheads (`ClassArrow` *is* an `EdgeEnd`),
  the line dashes for `..` (dependency/realization). Title/row metrics match the renderer + ER.
- Robustness pass: added `robust.test.ts` — `layoutDiagram` returns `ok` (never throws/rejects) for
  empty graphs (class/ER with no entities → empty ELK input) and self-loop edges (class/flowchart),
  the cases most likely to trip ELK. No bug surfaced.
- Added `layoutRequirement` (mirrors `layoutClass`): requirement/element compartment boxes sized to
  their `«kind»` tag + `key: value` field rows (the tag sits in its own compartment via `rowDivider`),
  joined by verb-labelled edges — an open arrow (`arrowOpen`), solid for `contains` and dashed for the
  other six verbs.
- Class stereotypes: `layoutClass` maps `ClassEntity.stereotype` to a `«…»` `SceneNode.subtitle` and
  grows the box title band by `CLASS_SUBTITLE_H` (mirrors the renderer) so the stereotype line sits
  above the name without crowding it or the divider.
