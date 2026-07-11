# @m/layout — work log

## 2026-07-11 — diamond nodes grow to contain their label + icon

A diamond was sized like a rect (label width × 40) in `toElkGraph`, but a diamond's sloped sides shrink
the usable area to its inscribed rhombus — so the label (and, since the omnibus gave flowchart diamonds
an icon, the 40px icon+label group stacked inside) poked out the bottom vertex. Surfaced by a user
looking at the deployed demo's default flowchart ("Authorized?" jammed against the diamond's tip).

`diamondBox` now sizes a diamond so the centred content box fits the inscribed rhombus
(`contentW/w + contentH/h ≤ 0.92`, budget split evenly): a plain diamond widens for its label (like the
mindmap `{{hexagon}}` already did), and an icon diamond also grows taller for the renderer's 40px
icon-group. Guarded by a new `transform.test.ts` invariant (label + icon fit the inscribed rhombus; the
icon diamond is taller than the plain one). App display-list golden refreshed. Verified across
flowchart/BPMN/state on the demo — labels now sit comfortably inside; empty-label state `<<choice>>`
diamonds stay small.

## 2026-07-11 — Mermaid-parity scene features + label/route decollision hardening

Screenshot-review fixes, all layout-side (no renderer/contracts changes — every new element rides the
existing SceneGraph caption/decoration mechanism):

- **Diagram titles render (gantt/pie/timeline).** New pure `core/title.ts` (`withTitle`): shifts the
  whole scene down one `TITLE_BAND` and adds the `title` as a centred caption above the chart, the way
  Mermaid draws it. Wired into `layoutGantt`, `layoutPie`, `layoutTimeline` (including their empty-scene
  early returns).
- **gitGraph classic shows commit ids + tags.** Classic dots carry no label, so Mermaid's id/tag text
  was silently dropped. `layoutGitGraph` (classic only — Pills already folds both into the pill label)
  now emits captions: the id below the dot and the tag above it (beside/opposite in TB/BT, the tag
  right-aligned against the dot via the measurer), growing the extent to fit. A bordered "tag plate"
  look would need renderer support (a caption style); plain captions for now.
- **Mindmap `{{hexagon}}` no longer overflows.** The hexagon renders as a diamond, whose sloped sides
  cut into a centred label: sized by the inscribed-rect condition `labelW/w + textH/h ≤ 1` instead of
  the flat-shape `clampedWidth`, so the text stays inside.
- **Gantt milestone labels sit beside the diamond.** A milestone is now a compact `BAR_HEIGHT`-square
  diamond on its date with an adjacent left-aligned caption (Mermaid-style), not a label-wide diamond
  with squeezed text; the chart width covers the captions, and the dependency hook enters a milestone
  at its RIGHT corner instead of crossing the diamond body to its left edge.
- **`decollideEdgeLabels` hardening (all families).** (1) Sheet clamp: every position — anchor,
  candidates, and the give-up fallback — is clamped inside the scene extent, so labels can't clip off
  the sheet (network's "SSH" at the top edge). (2) A `LABEL_GAP` clearance ring around node boxes, so
  labels don't graze borders (state's "correct" 2px off the note box). (3) Related containers (the
  endpoints' ancestor groups) contribute their TITLE BAND and four thin BORDER STRIPS as obstacles —
  a label may live inside its own group but no longer straddles the group outline or its title.
  (4) `marker`-role nodes (pie slice hit proxies) are skipped. (5) Diagonal search directions after the
  cardinals, for dense scenes.
- **Group-border tangles (cloud/block).** (a) `layoutBlock`: a composite whose content needs more
  columns than its parent grid offers had its width column-snap-clamped BELOW the content, so children
  (demo `web-1`/`api-2`) poked over the group border — the box width is now floored at the natural
  content width (that case spans the full row, so nothing sits to its right). (b) `rerouteBoxEdges`
  now adds `enteredContainerWalls` — thin wall boxes along the sides of an entered group that do NOT
  face the edge's other end — to the maze obstacles, counts border-sliding entries along an endpoint
  leaf's own border as hugs in `routeBadness`, and picks from maze candidates PLUS new orthodox L/Z
  `patternCandidates` (the maze returns one length-optimal path per mount pair, which on grid-aligned
  diagrams runs exactly along a sibling's border; the patterns supply the clean staircases) by fewest
  hits → least on-screen badness → shortest. Demo effects: cloud `alb→web "HTTP"` enters Services once
  through the facing (top) side instead of skimming the border into web's flank; block `lb→web-1`
  enters the `app` group through its top instead of looping outside the left border.
- **DOT cluster margin: verified shared, covered.** DOT-imported clusters already go through the same
  `CONTAINER_PADDING` ELK path as flowchart subgraphs (12px sides / 28px title band — confirmed in
  code and by test); new integration coverage asserts the member padding and that edge labels never
  straddle the cluster border (the border strips above fix the "relax" graze).
- Tests: +16 unit (`title.test.ts`, gantt title/milestone, pie/timeline titles, gitGraph classic
  captions incl. TB, mindmap hexagon fit, block composite containment, decollide clamp/gap/border,
  `enteredContainerWalls` + facing-side reroute) and +6 integration (`parity.test.ts`: demo-mirroring
  network/c4/cloud/block/state/DOT fixtures asserting labels on-sheet + off nodes, pairwise label
  separation, single facing-side group entry, group containment, note clearance, cluster padding).

## 2026-07-05 — relaxScene: gravity + repulsion cutoff (no more blow-up)

- Fruchterman-Reingold has no force holding a DISCONNECTED node (no incident edge), so pure repulsion
  flung it to infinity and the canvas ballooned to thousands of px. Added GRAVITY (a gentle per-step pull
  toward the layout centroid, which bounds the overall radius and keeps disconnected pieces compact) and a
  REPULSION_CUTOFF (units past 5×DESIRED apart don't repel, so far clusters stop shoving each other out).
- Regression test: disconnected nodes stay within a bounded distance of the centroid after a relax.

## 2026-07-05 — relaxScene: box-overlap resolution (groups no longer overlap)

- `relaxScene` now runs a box-overlap resolution pass after the Fruchterman-Reingold force loop:
  Fruchterman-Reingold repels by CENTRE distance, which didn't stop two boxes — notably big group /
  subgraph containers — from settling on top of each other. The pass pushes any overlapping pair apart
  along their minimum-translation axis (holding pinned units), so relaxed group boxes don't overlap.

## 2026-07-05 — relaxScene: generic force-directed relax

- New pure `relaxScene(scene, pinned)` — deterministic Fruchterman-Reingold (seeds from current centres,
  no randomness) over TOP-LEVEL units (a leaf, or a container moved rigidly with its descendants so
  nesting is preserved). Pinned units are held and the forces flow around them. Returns new origins for
  the moved nodes. Powers "Relax" for every node-graph family (was flowchart-only, ELK-seed).
## 2026-07-04 — SceneEdge.accent default

- Every family's edge construction now sets the new required `SceneEdge.accent` to `"none"` (colour is
  an overlay concern applied later by the builder); a pure contract follow, no behaviour change.
## 2026-07-03 — Reroute box-family edges that cross nodes or hug borders

- New `rerouteBoxEdges` pass (wired into `layoutDiagram` after the mount snap, and re-run in the app's
  `shownScene` after its trunk/bus re-route, before `separateEdgesFromBorders` + decollision). For each
  box-family edge it scores the CURRENT route by a VISUAL badness — segments crossing a non-endpoint
  leaf node's interior (heavy) or hugging any box border — and, if non-zero, searches mount pairs with
  the maze router (which stands off every obstacle by OBSTACLE_CLEARANCE, so its routes neither cross
  nor hug). It swaps in the maze route only when it is strictly cleaner by that same visual metric, so
  clean edges and unbeatable ones keep the trunk/bus geometry (the backbone aesthetic survives).
- `mazeAroundObstacles` gained a `force` flag so the search also runs when the current route merely HUGS
  (the old trigger was node-crossing only). The badness metric is deliberately identical to the
  `edge-border-clearance` e2e guard, so "cleaner" means cleaner ON SCREEN, not merely by the router's
  overlap test — this stopped a family (block) regressing while another (cloud) improved.
- Measured across the four box families: crossings+hugs drop from 22 to 18; the cloud example (dense
  cross-group wiring) drops from 8 to 4. Guarded by the e2e total-count assertion.
## 2026-07-03 — Lift edge segments off node/container borders they run along

- Container TITLE BANDS are obstacles for the pass too (a shift must never land a leg in the band where
  the group label sits), and the shift always moves AWAY from the hugged box's interior — an earlier
  variant that chose "the side with more room" once pushed a leg through a node between its endpoints.
- Scope note: the pass owns HUGGING (tangent-to-border) legs only. Through-node crossings (a connector
  cutting across a node in its path) are a separate, deeper problem — a local perpendicular shift can't
  route AROUND a node, and an interior-aware variant just relocated crossings elsewhere. That needs the
  maze router run on the re-routed trunk edges, or per-edge mount selection (see DO_NEXT).

- New `separateEdgesFromBorders` core pass (wired into `layoutDiagram` after the mount snap, and re-run
  in the app's `shownScene` after its trunk/bus/tidy re-route, before decollision). A channel leg placed
  exactly on a box's edge merges into that box's outline — the obstacle routers never catch it because
  running TANGENT to a border isn't crossing it. The pass shifts only INTERIOR (non-mount-anchored)
  segments perpendicular into the clear gap, toward the side with more room; in a gap too tight for full
  clearance it centres the segment rather than hopping onto the next border (which oscillated). Endpoints
  stay put, so mounts and orthogonality are preserved.
- Verified on the rendered scenes: cloud dropped from 6 border-hugging legs to 0, c4 clean. Two residuals
  remain (network `fw→rtr`, block `lb→web1`) — 3-point L-edges whose MOUNT-anchored segment sits on an
  adjacent box's border because the mount itself is on that line; fixing those needs mount re-selection
  (the same per-edge-port redesign as block column spans), not a post-routing shift. Documented in DO_NEXT.
- Edge-label decollision keeps only its NODE/label-overlap avoidance; the perpendicular off-line nudge
  moved to the renderer (draw time), because the app's per-render trunk/bus/tidy re-routing resets every
  labelPos to its line midpoint and would otherwise drop a layout-side nudge. The app also re-runs
  decollision after re-routing so node-avoidance survives.
## 2026-07-03 — Clean edge mounting + off-line labels (user-reported)

- Box-family (block/network/cloud/c4) edges attach at the side-CENTRE mount and separate in TWO
  dimensions away from the node — a per-rank staggered stub depth plus a per-rank staggered cross-channel
  leg — so a fan leaves a shared mount cleanly instead of sliding along the border to a spread port that
  crept toward a corner (`portAt` removed; the along-side jog is gone). Edges never attach at corners.
- Edge labels are nudged perpendicular OFF their own line in `decollideEdgeLabels` (before the overlap
  search, so the nudged position is decollided against nodes) — a plate-less label centred on the line
  read as struck through. The decollide pass also now always adopts the computed position (it used to
  return the label unchanged when no decollision was needed, discarding the nudge).
- C4 row/col gap 44→64 so labels on the short inter-node segments have room.
- Lane separation widened (user report: trunk/bus lines too close): `LANE_GAP` 8→14 with
  `CHANNEL_LANE` rescaled to match (≈ gap + 5, per the coupling note), `TRUNK_GAP` 18→26, and the
  snap's micro-jog tolerance 7→10 (the DNS→CDN stub sat just above 7). Goldens regenerated.
## 2026-07-03 — Family bug sweep (verified from user reports, screenshot-driven)

- **Label decollision ran before the mount snap, which recomputes every labelPos** — so every adjusted
  label was silently clobbered back onto whatever it had been moved off ("filtered"/"443/tcp" stamped
  over their own nodes). `layoutDiagram` now snaps first and decollides LAST; the decollide obstacle set
  additionally includes the edge's own endpoint leaf boxes (enclosing containers stay legitimate label
  space, and the stay-put fallback is unchanged).
- **Obstacle avoidance is correctness, not house style**: the maze reroute + crossing minimisation +
  overlap separation passes ran only under the opt-in tidy search, so classic (the default) could route
  edges through nodes. They now run for every flowchart layout, and the spread families (block/network/
  cloud/c4) get a corrective `mazeRerouteEdges` after port spreading (clean edges untouched; trunk/bus
  own their geometry).
- **Micro-jog cleanup**: mount clamping vs lane spreading can disagree by a few px, and
  `alignAdjacentToMount` turned that into tiny Z-stubs at arrowheads. The 2-point elbow insertion now
  skips near-axis-aligned edges (`ELBOW_MIN`), and `layoutDiagram`'s snap runs an endpoint-fixed
  Ramer–Douglas–Peucker pass (`MICRO_JOG_TOL`, parameterised so `spreadPorts`' internal snap and its
  unit-scale tests keep exact waypoints).
- **Gantt draws its dependencies**: each `after` ref becomes an elbow connector from the predecessor
  bar's visual end into the successor bar's start (bar bounds anchor both ends, so label-widened bars
  and centred milestones stay attached).
- **gitGraph classic tags lanes with label pills** (Mermaid-style); the house stickman stays in the
  opt-in Pills style.

## 2026-07-02 — Classic (Mermaid-parity) is the default layout style

- `layout`/`layoutDiagram` default to `"classic"` instead of `"tidy"`, and `layoutStyle` is now the
  closed `LayoutStyle` union (exported from `@m/layout`) instead of a raw string — an unrecognized
  persisted style value is rejected at the boundary rather than silently behaving as "all flags off".
  The tidy candidate search, bus/trunk routing, and organic force layout are unchanged, just opt-in.
  The flowchart property tests now run every generated graph under BOTH classic and tidy so the
  invariants (and coverage) hold for both pipelines. Re-based the coverage ratchet, which had silently
  drifted ~6 points above actual on main (nothing in the hook pipeline runs `make cov` — gate wiring
  tracked in DO_NEXT).

## 2026-06-30 — Cardinal mount invariant sweep

- Added `cardinalMountViolations(scene)` and `edgesUseCardinalMounts(scene)` as exported pure
  invariants for graph families whose edge endpoints must land on top/bottom/left/right node mounts.
- Added unit coverage for the invariant, including diagnostic edge/node/end/endpoint reporting.
- Tightened the `widestLine` property test so "single-line" generated labels exclude both actual
  newlines and literal `\n`, matching the renderer/layout multiline-label contract.

## 2026-06-30 — Label and icon rendering parity

- `layoutNetwork` now maps node-kind defaults to bundled vendor icon packs (`devicon`/`k8s`) instead of
  authored `arch` placeholders; explicit `icon "<pack>/<name>"` overrides still win.
- Cardinal mount points are now the endpoint contract for box-like graph families: flowchart, C4, block,
  network, cloud, state, ER, class, and requirement routes snap to side midpoints or diamond vertices.
- `spreadPorts` and trunk routing now keep fan-out lanes outside the node boundary instead of treating
  arbitrary side coordinates as valid connector endpoints.
- C4 boundaries now wrap larger child sets into compact rows instead of forcing every contained element
  into one long strip.
- State diagrams now pass `StateAst.direction` through `stateToFlow`, so `direction LR/RL/BT/TB` affects
  ELK layout.
- Shared label measurement now treats literal `\n` sequences as line breaks, matching renderer output.

## 2026-06-30 — First-class architecture layout cleanup

- Added semantic accents to cloud and network nodes/groups.
- Changed network root placement from square packing to a left-to-right zone row, while nested subnet
  contents remain compact.
- Widened the cloud top-level row budget for tiered architecture demos and marked async/event groups as
  ops-accented.
- Converted timeline period-to-event connectors from decorations to real edges so drag overrides carry
  the connectors with event nodes.

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
- `layoutNetwork` now honours a `NetworkNode.icon` override (falling back to the kind's bundled vendor
  glyph).
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
- Quality sweep: extracted the three near-identical compartment layouts (`layoutEr`/`layoutClass`/
  `layoutRequirement`, ~280 lines of duplicated ELK boilerplate) into one `layoutCompartments` engine
  driven by `CompartmentBox`/`CompartmentEdge` specs + a per-family metrics record. The three are now
  thin AST→spec mappers. Behaviour-preserving: the per-family metrics keep each family's exact box
  sizing, so every pipeline golden is byte-identical (verified by running goldens without `-u`).
- Documented that `elk.bundled.js` runs ELK in an inlined Web Worker in the browser (inline under
  Node), so `elk.layout` is genuinely off the main thread — the heavy graph computation never blocks
  rendering/interaction. (Noted not to wrap it in a second Worker: nesting the inlined worker breaks
  under bundlers.)
- Added `layoutGitGraph` (`core/gitgraph.ts`): a deterministic git-graph engine (no ELK), wired into
  `layoutDiagram`'s `gitGraph` case. Commits march along the main axis in creation order; each branch
  owns a cross-axis lane (`main` = lane 0). `LR` (Mermaid default) runs commits left→right with lanes
  stacked top→bottom; `TB`/`BT` swap the axes (BT also flips the commit axis so history grows upward).
  Commits are circle nodes (`HIGHLIGHT` → rect), branch names round head nodes; one edge per parent so
  branch points fan out and merges fan back in. Fails loudly on a commit referencing an undeclared
  branch. +6 unit tests.
- Added `layoutTimeline` (`core/timeline.ts`), wired into `layoutDiagram`'s `timeline` case: a
  deterministic column layout (no ELK). Periods sit in a left→right row joined by a single horizontal
  spine polyline; each period's events stack in its column below it; a `section` run (contiguous periods
  sharing a section) gets a labelled `container` band above the row. Periods are rounded header nodes,
  events plain rects — all existing SceneGraph primitives, so no renderer change. Columns are sized to
  their widest label, so timeline labels (unlike gitGraph dots) sit inside their boxes. +5 unit tests.
- Added `mindmapToFlow` + a `mindmap` case in `layoutDiagram`: a mindmap is a tree, so (like
  `stateToFlow`) it lays out through the flowchart ELK path. Nodes map to shaped flowchart nodes
  (`MindmapShape` → `NodeShape`; hexagon approximated by a diamond), parent→child links to arrowless
  (`open`) edges, direction `LR` (root at left, branches fanning right). No dedicated engine and no
  renderer change — ELK's layered tree does the work. Covered in the layout integration test.
- Added `layoutPie` (`core/pie.ts`) + a `pie` case in `layoutDiagram`: a deterministic radial layout
  (no ELK). Slices are sized by their share of the total and laid clockwise from 12 o'clock (canvas
  angle `-π/2`); output is a `Scene` with only `wedges` (no nodes/edges). An empty / title-only pie
  returns a valid empty scene rather than dividing by zero. +5 unit tests. All other layouts now emit
  `wedges: []`.
- Polished `layoutPie`: each slice now also emits a **legend** entry — a full-circle wedge (the renderer
  draws it as a colour-disc swatch with its label to the right) stacked in a column beside the disc. The
  legend label carries the slice name plus the raw value when **`showData`** (previously parsed but
  never rendered); the on-slice label dropped to just the percentage, so thin slices stay readable. The
  extent grows to fit the legend (measured label widths). +6 unit tests (slice/legend split, showData).
- Replaced the mindmap's layered-tree-via-ELK rendering with a dedicated **radial** engine
  (`core/mindmap.ts`, `layoutMindmap`): the root sits at the centre and each subtree fans into an
  angular sector sized by its leaf count (dense branches get more room), depth → radius; a forest
  (>1 root) rings its roots around a virtual hub. Nodes are sized to their labels and shaped
  (hexagon → diamond), edges are arrowless parent→child spokes. Positions are computed centred on the
  origin then shifted into a positive extent. Dropped the `mindmapToFlow` ELK adapter. +5 unit tests.
- Polish round: **fixed the gitGraph label-overflow bug** — commits are now rounded pills sized to
  their id+tag (was a fixed ~26px dot the label spilled out of), with per-axis pitch sized to the pills
  so neighbours don't collide in LR or TB (no renderer change). **pie legend wraps** into columns when
  a long slice list would run past the disc bottom (column pitch from the widest label). +tests updated.
- `stateToFlow` maps the new state kinds to shapes (fork/join → rect bar, choice → diamond); timeline
  cells grow in height for `<br>` multi-line labels (widest line sets the width).
- mindmap spokes + gitGraph branch/merge connectors now set `SceneEdge.curved`; `layoutClass` surfaces
  a relationship's multiplicity as the edge's `fromLabel`/`toLabel`; `stateToFlow` turns each state
  note into a rect node joined to its target by an arrowless connector (ELK places it adjacent).
- Audit-sweep fix: the ELK adapter now concatenates **all** of an edge's `sections` (was taking only
  `sections[0]`, truncating a container-crossing edge's route).
- Style coherence: the nine layout cores now mint Scene ids via `sceneNodeId`/`sceneEdgeId` (from
  `@m/contracts`) rather than raw `brand<…>`, so `src/core` is free of the cast (guard-enforced).
- Perf: `transform.toElkGraph` indexes subgraphs by parent once (a Map) instead of re-filtering the
  whole subgraph list at every nesting level (was O(S²)).
- Audit fix: gitgraph + pie sized labels via `Math.max(...arr.map())`, which throws (argument-count
  limit) on a very large history/pie — a totality break in a pure core. Switched to `reduce`.
- Type-system hardening: `stateShape` over `StateKind` now lists `start`/`end` explicitly and ends in
  `default: assertNever(kind)` instead of a `default: "circle"` that swallowed unhandled kinds — a new
  `StateKind` is now a compile error rather than a silent circle.
- Refined-number brands: `layoutBlock` dropped its `Math.max(1, ast.columns)` clamp now that
  `BlockAst.columns` is a `PositiveInt` (≥1 by construction) — the type carries the invariant the clamp
  used to re-assert.
- `SceneEdge.waypoints` is now `TwoOrMore<Point>`. A new `routeWaypoints` helper (`core/route.ts`) builds
  it from a routing engine's point list, falling back to a **straight line between the endpoint centres**
  when ELK returns a degenerate (<2-point) route — a defined geometry, not the old silent skip and not a
  blanked diagram. The flowchart (`transform.ts`) and ELK (`elk.ts`) edge builders route through it
  (using the just-built node centres); the timeline spine uses `twoOrMore` directly. +route.ts tests.
- New family (Gantt) — layout. `layoutGantt` (pure) turns a `GanttAst` into a timeline of bars: each
  task is a rect, x by its start day, width by its duration, one row each in document order. `date`
  starts parse ISO `YYYY-MM-DD` to a UTC day number; `after` starts chain off the referenced task's end
  (resolved in declaration order). Bars are widened to fit their label; no edges (`after` is positional,
  not a drawn arrow). Fails loudly on an unknown `after` ref or a non-ISO date. +6 unit tests.
  (Standalone — `layoutDiagram` doesn't dispatch to it until the family is activated into `DiagramAst`.)
- Gantt polish: `layoutGantt` sets each bar's `accent` from the task status via `STATUS_ACCENT`
  (`done→muted`, `active→active`, `crit→danger`, `normal→none`), so the renderer can colour bars by
  status.
- Gantt axis: `layoutGantt` now emits `decorations` — a **weekly date axis** (a `rule` gridline + a
  date `caption` every 7 days across the span) and a **section gutter** (a left-aligned `caption` per
  section). Bars shifted past a left gutter + top axis band to make room. +2 unit tests (relative bar
  offsets; gridline/caption counts + texts). The chart now reads as a proper Gantt.
- Gantt milestones: a `milestone` task lays out as a **diamond** centred on its date (not a bar).
  +1 unit test (task → rect, milestone → diamond).
- Gantt multiple `after` refs: a task starts at the **latest** predecessor's end — fold each ref's end
  through `Result`, failing loudly if any is unknown. +2 unit tests (latest-end pick; one unknown ref fails).
- Gantt `excludes`: weekends (epoch-day `getUTCDay`) and holiday dates are non-working — a start landing
  on one shifts to the next working day, and a duration is spent only on working days so the bar stretches
  across the skipped ones (`workingEnd` walk; identity when nothing is excluded). Invalid excluded dates
  fail loudly. +4 unit tests (weekend stretch; start shift; holiday; bad date).
- Gantt section bands + excluded columns: emit a `band` decoration per contiguous same-section run (a
  full-width zebra stripe, `section`/`sectionAlt` alternating) and one `excluded` column per non-working
  day in the visible span — behind the gridlines/captions. +3 unit tests.
- Gantt axis spacing now follows `ast.tickIntervalDays` (was a fixed weekly `DAYS_PER_TICK`) — a wider
  interval emits fewer gridlines/date captions. +1 unit test (21-day span: weekly 4 ticks, biweekly 2).
- Gantt `parseDay` is now total (`GanttDate → number`): since dates are validated at the parse boundary,
  its two date-format failure paths (a bad task start date, a bad excluded date) were dead and are
  removed — the date branch and the excludeDates loop no longer return a `Result` error. (The two
  layout-level bad-date tests moved to the parser, where the validation now lives.)
- State layout now restores semantic `SceneNode.role` values after converting the state AST to the
  shared flowchart/ELK path: `[*]` start/end, `<<fork>>`/`<<join>>`, and notes survive as renderer-facing
  roles instead of being indistinguishable generic circles/rects.
- State layout now also honours `StateNote.side`: after ELK places the shared graph, notes are moved
  to the requested right/left/over side of their target, note edges are re-anchored, and the scene extent
  is recalculated. +integration test.
- Pie layout now maps `PieAst.donut` to a non-zero `SceneWedge.innerRadius` for slices while keeping
  legend swatches as full discs. +unit test.
- DRY sweep (shared core helpers). Extracted two pure helpers used across the layout cores:
  - `core/measure.ts`: `widestLine(text, measure)` (widest measured line via `reduce`, not
    `Math.max(...spread)` — total on a pathological many-line label) and `clampedWidth(text, measure,
    min, pad)` = `Math.max(min, widestLine + pad)`. The duplicated `labelWidth`/`leafWidth`/`actorWidth`/
    `nodeWidth`/`widestLine` bodies across block/network/cloud/c4/transform/sequence/mindmap/timeline
    now call these, each keeping its own `MIN_*`/`PAD` constants. Replaced timeline's spread-form
    `widestLine` (a totality hazard) and removed c4's local `widestLine`. Semantics-preserving — every
    single-line site still measures `measure(label)` (the `reduce` seeds at 0, ≥ any non-negative width).
  - `core/grid.ts`: `gridGeometry(items, columns, cellWidth, cellHeight, gap)` → each item paired with
    its row-major cell corner (`{ item, x, y }`) plus the overall extent (used-columns/rows floored at 1).
    `layoutBlock`/`layoutNetwork` now derive node corners and extent from it (only the byte-identical
    geometry — each keeps its own constants, SceneNode construction, and edge styling; no callback engine).
    Pairing items with cells (rather than returning a bare `count` of positions) keeps the read total
    under `noUncheckedIndexedAccess` — no fallback index.
  - `elk.ts` (shell) replaced its two `e instanceof Error ? e.message : String(e)` catch idioms with
    `messageOf` from `@m/std`.
  - +fast-check tests: `measure.test.ts` (`widestLine`/`clampedWidth` bounds + many-line totality) and
    `grid.test.ts` (`gridGeometry` order, placement formula, extent containment, empty/multi-row cases).
    Existing block/network grid property tests stay green (geometry unchanged).
- core: `retidyRoutes(scene)` — re-route every non-orthogonal, non-curved connector as a right-angle
  path between its endpoints' boxes (reuses `orthogonalRoute`); leaves clean + curved edges (and returns
  the same scene on a no-op). Lets the app snap a move-blended diagonal back to right angles. 3 unit tests.
- Block composites: `layoutBlock` is now a recursive **nested variable-cell grid** — each column takes
  its widest item, each row its tallest, so a `block:id … end` container (laid out from its own
  `children`/`columns`) fits as one larger cell; uniform leaves degenerate to the prior fixed grid.
  Containers render via the shared `container` shape; edges route orthogonally across boundaries.
- Totality: closed two id-keyed-recursion stack-overflows a pipeline fuzz surfaced (a duplicate id
  nested in its twin re-enters the same children bucket forever). `layoutC4` now rejects duplicate
  element ids; `toElkGraph`'s subgraph `container` carries an on-path visited guard; `cloud`'s nested
  `place` gained a `MAX_NEST_DEPTH` cap matching `network`/`block`. All four nested-container layouts are
  now guarded.
- Sequence notes: `layoutSequence` interleaves notes with messages by source order (shared row stack),
  drawing each as a folded-corner `stateNote` box — centred for `over A` / `over A,B` (spanning both
  lifelines), offset for `left of`/`right of`. A `left of` note on the leftmost actor can land at a
  negative x, so the whole scene shifts right to keep the (0,0)-origin extent every family uses.
- Edge-label overlap (the "cloud is bunched up" report + its class): the hand-rolled absolute layouts
  (c4/cloud/network/block) placed edge labels at the routed midpoint, whose opaque plate landed on a
  node in a tight 24px gap. Bumped `GAP` (c4/cloud/block 24→44, network 40→48) so labels fit the
  channel, and for the orthogonal layouts (cloud/block) set `labelPos` to the route's central
  cross-segment (`routeChannelMid`) — clear of both boxes by construction. ELK families already
  reserve a label box, so they were unaffected. (A label landing on a *skipped-over* node still needs
  real obstacle avoidance — out of scope.)
- Mindmap layout is now total on an internally-inconsistent AST: a rootless node set (orphans / a parent
  cycle) returns a clean layout error instead of throwing on an ±Infinity extent, and a depth cap breaks
  a root→…→cycle recursion (matching the other nested layouts' MAX_NEST_DEPTH guard).
- Edge-routing overlap reduction (from the LAYOUT_RESEARCH spike's deterministic recommendations):
  - ELK families (flowchart/state/er/class/requirement): added edge-edge / edge-node spacing options
    (within a layer and between layers) so parallel connectors get their own lane instead of stacking.
  - Hand-rolled architecture families (cloud, block): new `spreadPorts` post-pass re-routes every box→box
    edge into distinct *ports* along each shared node side (ordered by the opposite endpoint to avoid
    needless crossings), instead of every edge exiting/entering the side centre. Deterministic; self-loops
    and dangling edges are left untouched. Edge labels follow the new channel.
- Edge routing v2: `spreadPorts` now also runs for network + c4 (were centre-to-centre straight lines),
  and it staggers parallel edges' cross-channel legs (clamped into the gap) so several A→B connectors no
  longer lay their middle legs on top of each other.
- Energy-aware layout, PR 1 (measurement only, no behaviour change): `energy.ts` — a pure
  `layoutEnergy(scene)` scoring edge crossings (×10), edges through unrelated nodes (×6, containers
  excluded as regions), node overlaps (×20) + a faint tidiness term; `lowestEnergy` picks the min
  deterministically (for the future candidate-and-select). `invariants.ts` — family-agnostic style
  predicates (`noSiblingOverlaps`, `containersEncloseMembers`, `styleOk`) that gate candidate eligibility
  and are now asserted across every example fixture, locking today's styles as the baseline. The golden
  test logs each example's energy (all examples are crossing-free; the timeline's 1 edge-node hit is its
  intended axis spine).
- Energy-aware layout, PR 2 (opt-in): an `elkSelectBest` step runs a few DETERMINISTIC ELK candidates
  (default config + two crossing-minimization / node-placement variants), filters each through `styleOk`,
  and keeps the lowest-`layoutEnergy` survivor — for the layered families only (flowchart/state/er/class/
  requirement), threaded via a `tidy` flag on `layout`/`layoutDiagram`. When off, only the default
  candidate runs → today's exact output. The default candidate is always in the running, so tidy can
  never raise the energy.
- Energy-aware layout, PR 3: "Tidy" now also reorders gitGraph branch lanes. `layoutGitGraph` is
  parameterised by a branch→lane map; under `tidy` (≤5 branches) it tries every lane permutation with the
  first branch (conventionally `main`) pinned to lane 0, filters through `styleOk`, and keeps the
  lowest-`layoutEnergy` one — so cross-lane merge/branch edges draw with fewer crossings. Default (off) is
  the declared order, byte-identical to before. Mindmap is left as-is (its disjoint angular sectors are
  already crossing-free, so reordering has no benefit).
- Obstacle-avoiding edge routing: `spreadPorts` now reroutes any Z-route whose leg would cut through a
  non-endpoint, non-container node. It searches two orthogonal detour topologies (channel along the
  dominant axis, and transposed perpendicular — a dog-leg lifting an aligned obstacle off the straight
  line), each scanned across positions inside and beyond the inter-box gap, keeping the fewest-hits then
  shortest route. Routes that already clear every box are returned unchanged (no golden churn on clean
  diagrams). Helps the spreadPorts families (network/cloud/c4/block).
- Family-context style invariant: `pieSlicesTileCircle` lives in the pie layout (only it can tell the
  slice wedges, sharing the pie centre, from the per-swatch legend discs) and verifies the slices sum to
  2π — asserted in the pie unit test and the golden baseline.
- Organic layout: `elkLayoutOptions(c, organic)` swaps the layered algorithm for ELK `stress` (force-
  based), threaded as an `organic` flag through `layout`/`layoutDiagram` for flowchart + state only — an
  opt-in free-form look, never a default; the compartment families stay layered.
- Grid maze router (`maze.ts`): a pure A* over a Hanan grid (lines at every obstacle border ± a margin
  plus the endpoints), orthogonal moves only, turn-penalised so it prefers few bends — the general
  multi-bend detour the local Z-repair couldn't do. `spreadPorts` now: keeps a clean staggered route
  unchanged (no churn); else tries `mazeRoute`; else falls back to the local two-topology repair.
- Family-context style invariants for the remaining families, each co-located with its layout (only it
  knows which nodes/edges are which): `sequenceActorsShareHeaderRow`, `timelinePeriodsAdvanceLeftToRight`,
  `ganttTasksStackInRowOrder` — asserted on the real examples (golden baseline) and with pos/neg units.
- Cloud separation: a wider `ROW_GAP` (72) than the side-by-side `GAP` (44) between stacked group rows,
  so cross-row connectors get a roomier vertical channel for the router to spread/detour them.
- ELK families route through the maze router under Tidy: `elkSelectBest` runs `mazeRerouteEdges` on the
  chosen scene when `tidy` is on, so a residual ELK edge crossing a node bends around it (clean edges
  untouched). Default (Tidy off) ELK output is unchanged.
- Unified obstacle clearance: a single `OBSTACLE_CLEARANCE` and a shared `segmentThroughBox` now live in
  `maze.ts` and are imported by `route.ts` (the duplicate copy + `OBSTACLE_MARGIN` are gone).
- `decollideEdgeLabels(scene, measure)`: greedily nudges overlapping mid-edge labels vertically apart
  (a no-op when none overlap); applied after `spreadPorts` in cloud/network/c4 to de-clutter dense
  architecture diagrams.
- Smarter edge routing (tendencies, with fallback): per-edge obstacles now include any GROUP CONTAINER
  the edge doesn't enter (an endpoint isn't that container or nested in it), so edges keep out of groups
  they don't belong to; the obstacle-crossing maze reroute now tries all four side mount-points of each
  endpoint and keeps the lowest-crossing, then shortest, path. Shared `obstaclesForEdges` used by both
  `spreadPorts` and `mazeRerouteEdges`.
- Edge-label de-collision v2: overlapping mid-edge labels move to the NEAREST clear spot (outward search
  in all four directions, smallest displacement — follows the edge instead of a fixed vertical drop), and
  it now runs once for EVERY family in `layoutDiagram` (the ELK families included), not just the
  spreadPorts ones.
- gitGraph made realistic: commits are labelled with a deterministic short SHA (FNV-1a → 7 hex), parent→
  child edges are straight arrows trimmed to the pill borders (so the arrowhead is visible), and each
  branch head is a stickman (`shape: "actor"`). `mainStart` now clears the first wide sha pill past the
  head.
- Global edge–edge crossing minimisation: `spreadPorts` ends with a greedy `minimizeCrossings` pass —
  for each edge that crosses another, it re-routes from each of the endpoints' four mount-points with the
  conflicting edges fed to the maze router as thin obstacles, keeping whichever orthogonal route crosses
  the fewest OTHER edges (without adding node/group crossings, then shortest). Early-outs on a crossing-
  free scene (byte-identical), bounded sweeps, strict improvement → terminates, never worse.
- Crossing-min v2: `minimizeCrossings` is now an exported greedy-local-search + ITERATED-LOCAL-SEARCH
  optimiser — when the greedy stalls with crossings left, it deterministically kicks one edge onto a
  different route and re-descends, keeping the best total seen (escapes local minima, never worse). It's
  also applied to the ELK families under Tidy (`minimizeCrossings(mazeRerouteEdges(best))` in
  `elkSelectBest`), not just the spreadPorts families.
- Crossing optimiser performance: profiling showed the proposed maze-candidate cache barely helps (the
  per-edge maze queries are nearly all unique), so the real win is OBSTACLE CULLING — each maze only gets
  the node/group boxes near the edge's endpoints, shrinking its Hanan grid. A realistic 256-node /
  210-local-edge diagram drops from grid-bound to ~24ms. A memo is still kept (occasionally hits) and the
  iterated-local-search scales its kicks down on pathologically dense inputs.
- Barycenter lane ordering for gitGraph: above the ≤5-branch brute-force cap, `barycenterLanes` orders the
  lanes by the mean adjacent lane (the classic crossing-reduction heuristic, deterministic, main pinned to
  lane 0), compared against the declared order by energy — so a large git-flow declared out of order gets
  untangled (e.g. a mis-declared 6-branch chain: 2 crossings → 0). The ELK layered families already get
  barycenter crossing-min from ELK; spreadPorts already orders ports by the opposite endpoint.
- Edge OVERLAP separation (the real "heavily overlapped edges" fix): the crossing optimiser now counts a
  "conflict" as a perpendicular crossing OR a PARALLEL OVERLAP (two collinear segments stacked on the same
  track), and minimises both. `spreadPorts`'s channel staggering only separated edges sharing one node
  side; edges from different sources funnelling through the same channel still stacked invisibly — those
  now get pulled onto separate tracks via the maze reroute. Measured on a cloud example: parallel overlaps
  25 → 3 (network 5 → 0). De-overlapping trades a few stacks for readable crossings (total conflict still
  drops), so edges become individually traceable instead of merged into one thick line.
- Channel-width reservation + lane separation (the ROOT fix for stacked architecture edges): the previous
  conflict-optimiser de-stacked by re-routing, which trades overlaps for crossings. The real cause is node
  placement — edges funnel through channels too narrow for parallel lanes, so de-stacking *requires* room.
  `reserveChannels` (runs first in `spreadPorts`) groups top-level nodes into bands per axis, counts edges
  crossing each inter-band gap, and shifts bands rigidly (groups move whole, containment preserved) so each
  gap fits a lane per crossing edge. `separateOverlaps` (runs after crossing-min) then nudges collinear
  stacked segments onto adjacent parallel tracks — a topology-preserving lane assignment that keeps a nudge
  only when it worsens neither crossings nor node clearance. Measured on a cloud example: 2 crossings / 25
  overlaps → ~7 / 1; network 0 / 5 → 1 / 0 — dominates the re-route-only result (11 / 3) on both axes.
  Both passes are no-ops on sparse diagrams (gaps already suffice / nothing stacked), so the small golden
  examples don't churn beyond the genuinely-denser block + network. Strong-typed throughout: branded
  `SceneNodeId` band maps, `OverlapSeg`-keyed offset maps (no stringly composite keys), numeric track keys,
  named constants (`CHANNEL_BASE`/`CHANNEL_LANE`/`LANE_GAP`/`MAX_NEST_DEPTH`/`SEG_AXIS_EPS`), explicit
  optional handling (no fabricated `?? 0` defaults).
- Hand-arranged diagrams now re-route through the FULL router (`respreadPorts`). Diagnosis: after a drag,
  the app re-routed via `retidyRoutes`, which only snaps diagonal edges back to naive per-edge Z-routes —
  no port-spreading, crossing-min or overlap separation. So a hand-arranged architecture diagram looked
  far messier than its auto-layout (edges sharing a node side stacked at the box centre). `respreadPorts`
  factors the position-respecting routing core out of `spreadPorts` (everything except `reserveChannels`,
  which must NOT run on a drag — it would move the user's nodes) and runs it on the moved scene. Measured
  on a four-edge hub: naive `retidyRoutes` left 8 parallel overlaps; `respreadPorts` 0. The app calls it
  for the box-routed families (cloud/network/c4/block) on drag RELEASE (mid-gesture stays on the cheap
  diagonal-snap so the diagram doesn't churn under the cursor).
- Bus routing flag on `routeSpread`/`respreadPorts`: with `bus` set, the spread routes are kept as-is
  (skip the crossing-min + overlap-separation passes), so connectors to a shared endpoint stay coincident
  on a common backbone instead of being de-stacked onto separate lanes — the layout half of the opt-in
  junction/bus rendering (the renderer marks the junctions).
- Trunk merging (`trunkRoutes`) — the aggressive bus. Where the gentle Bus mode just left the staggered
  routes coincident, `trunkMerge` ACTIVELY re-routes each fan: for any node side reached by ≥3 connectors
  it builds one shared trunk line just off that side and routes the whole fan through it into a single
  shared port, so the fan genuinely shares a backbone (the renderer marks a junction where each edge
  joins). Bigger fans claim their edges first; an edge already in a trunk isn't pulled into another;
  non-fan edges keep the spread routes they came in with. Display-only (respects given positions, no
  channel reservation). Wired to a new "Trunk" toggle in the app, taking precedence over "Bus".
- Balanced candidate sorting in `minimizeCrossings`: replaced strict lexicographical sorting (crossings first, then length) with a balanced crossing-and-length score using a new `CROSSING_COST = 75` constant. This prevents pathologically long detours around the outside of dense diagrams (like Cloud) by preferring short paths with a few crossings over massive outer loops.
- Cost-based optimization in greedy search and ILS: modified `greedyReduce` and `minimizeCrossings`' ILS loops to optimize for the combined crossing-and-length score instead of purely crossings. Previously, even if the candidate sorter preferred a channel path, the greedy/ILS loops would still force the outside path because it had fewer crossings, ignoring the huge length penalty. Also updated unit tests to use custom, closer node bounds where detours are realistically sized.
- Split crossing/overlap routing cost function: Differentiated perpendicular crossings (`CROSSING_COST = 10`) from parallel overlaps (`OVERLAP_COST = 150`) in the cost evaluation. In both greedy sweeps and ILS optimization passes, paths are evaluated on their combined `ConflictCost + Length` score, favoring short direct routes with minor crossings over huge outer-loop detours, while strictly penalizing and avoiding parallel line overlaps.
- Enhanced trunk routing with A* obstacle avoidance and dynamic balanced channel placement: Each edge's approach to the trunk backbone is routed using the A* maze router around obstacle boxes to prevent obstacle clipping. The trunk coordinate is calculated dynamically in the center of the available routing channel between the target node and the source endpoints (clamped to safe margins). The minimum fan size threshold was lowered to 2, and the playground UI defaults trunk-routing to active on first load.
- Wired unified `layoutStyle` parameter through the layout entry points, mapping styles (classic, tidy, organic, relaxed, bus, trunk) to the internal routing pipelines and layout engine presets. Replaced the isolated buttons in the playground UI with a dynamic style dropdown, persisting the style preference per diagram family in local storage. Added specific classic styles for gitGraph (small empty circles and straight lines), sequence (relaxed curves), mindmap (classic tree with straight spokes and rect nodes), and pie (donut style). Updated all test suites and resolved all typescript compiler and biome format checks.
- Standardized self-loops in `c4`, `network`, and `cloud` layouts to render as a 5-point right-angle loop at the top-right corner of the node, with the label positioned at the outer corner, resolving silent drops (Cloud) and degenerate dots (C4/Network).
- Added node and group bounds to the edge label decollision search (`decollideEdgeLabels`), excluding direct endpoint ancestors of each edge to prevent labels from being pushed away from their own connections.
- Implemented smart A* auto-routing option selection in `mazeAroundObstacles`: updated A* routing to generate up to 16 unique candidate paths from all combinations of node boundary mount points, sorting them by obstacle hits, bends, and length. Let callers specify a `routeOption` index to cycle through these candidate paths. Exported new routing helpers from the layout module. Applied trunk and bus layout styles automatically to all spread diagram families (network, cloud, block, c4) in `layoutDiagram`.
- Restricted trunk merging in `trunkMerge` to only group edges that share their destination node (`e.to`), matching electronics board routing patterns. Updated corresponding test cases.

- Improved spread-family demo readability: network layout now places ungrouped/external nodes before
  groups so ingress nodes stay near the front of the diagram, and cloud layout reserves larger
  inter-service/inter-row gaps for dense architecture routes.
- Tightened the cloud top-level row budget again so the public AWS starter falls into ingress,
  services, and data/identity/operations tiers instead of keeping too many groups on one horizontal
  band.
- Added container-title-aware routing: entered containers no longer exempt their visible title label from
  obstacle avoidance, `styleOk` now rejects edges through container titles, and ELK tidy candidates are
  maze-rerouted before candidate selection so swimlane/subgraph examples honor the same guard.
- Improved cross-boundary grouped-child routing: side selection now uses the containing group as the
  orientation box when an edge crosses a group boundary, while the port itself remains on the child node.
  The cloud starter's ALB-to-service connector now enters the services tier from above instead of tracing
  along the tier title.
- Added family-gated side-centre mount cleanup: ELK/compartment box diagrams now snap edge endpoints to
  the nearest top/bottom/left/right mount based on the adjacent segment, so connectors no longer land on
  square corners. The cleanup skips architecture spread families and semantic families whose anchors are
  not generic box ports, and the snapper avoids rewriting the opposite endpoint on two-point routes.
