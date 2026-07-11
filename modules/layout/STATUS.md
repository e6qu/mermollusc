# @m/layout — status

**State:** flowchart layout + relax (semi-interactive) implemented; `make check` green.

**Defaults:** `layout`/`layoutDiagram` default to the `"classic"` style — the closest match to real
Mermaid output — with the house styles (tidy candidate search, organic force, bus/trunk routing) opt-in
via the closed `LayoutStyle` union. Two honest parity gaps remain (see `DO_NEXT.md`): the engine is ELK
layered (Mermaid's default is dagre), and edges are orthogonal polylines (Mermaid draws splines).

**Current architecture note:** network root zones now lay out left-to-right with vendored default
icons, cloud uses semantic architecture accents with vendored default icons and a wider tier row budget,
state diagrams honor source direction, timeline event connectors are real edges, and graph endpoints use
cardinal mount points across the box/diamond families. The exported `cardinalMountViolations` invariant
now backs catalog checks for normal, bus, and trunk display routes. C4 boundaries wrap larger child sets
into compact rows instead of a single horizontal strip.

- `layout(ast, seed?)` → `Promise<Result<Scene, LayoutError>>` (shell). A non-empty `seed`
  (node → current position) runs ELK semi-interactive layered layout — relaxing around the
  manual positions; an empty seed (the default) is a clean layout (regenerate).
- core uses a typed `LayoutConfig`; the string-keyed ELK option bag is built only in the shell.
- core (pure): `toElkGraph(ast, seed)` (sizes `circle` nodes square so they render round; other
  shapes are label-width boxes) and `toScene(positioned, ast)`. `LayoutNode` is a `Leaf | Container`
  discriminated union — a leaf carries its size, a container only its children (ELK sizes it), so a
  "leaf with children" / "sized container" is unrepresentable.
- **Subgraphs:** `toElkGraph` nests `FlowchartAst.subgraphs` as ELK compound nodes (members + nested
  subgraphs as children, title padding); the shell lays out with `hierarchyHandling: INCLUDE_CHILDREN`
  and flattens ELK's parent-relative child coordinates to absolutes (`PositionedNode.parent` tags the
  container). `toScene` emits a `container`-shape SceneNode per subgraph with members parented to it —
  which the renderer's existing C4-boundary `container` rendering draws, so no renderer change.
  **Edge geometry is also container-relative** under INCLUDE_CHILDREN: ELK tags each returned edge with
  its least-common-ancestor `container` and returns its sections + label box *relative to that container*.
  `toPositioned` records every container's absolute origin while flattening nodes and offsets each edge's
  points + label by it (root → 0,0), so an intra-subgraph edge's endpoints land on its member boxes
  rather than a container-origin away (the old bug made internal edges look detached / routed around).
- `layoutSequence(ast)` (pure): actors row, vertical dashed lifelines, stacked message arrows.
- `layoutC4(ast)` (pure): nested-box layout — boundaries wrap their children; relations are
  straight centre-to-centre edges.
- `layoutBlock(ast)` (pure): row-major grid in a `columns`-wide uniform cell; straight
  centre-to-centre edges.
- `layoutNetwork(ast)` (pure): squarish (`ceil √n`) grid; ungrouped/external leaf nodes are placed
  before grouped zones so ingress nodes stay visually ahead of the subnets they connect to; undirected
  (arrowless) links; sets each node's default `icon` ref from bundled vendor packs.
- `layoutCloud(ast)` (pure): recursive nested-box — groups render as containers wrapping children;
  top-level boxes wrap to a new row past a narrow soft width budget with larger inter-row lanes, so
  tiered architectures stay readable rather than one wide strip; each service leaf's kind maps to a vendored simple-icons glyph
  (`docker`/`postgresql`/`apachekafka`/`cloudflare`/`googlecloudstorage`); undirected `--` links plus
  directed `-->` traffic edges, **orthogonally routed** (right-angle Z-bend, exiting/entering the facing
  sides so the arrowhead sits at the target border and the label anchor lands in the channel rather than
  on a box).
- All layouts take a **required** `MeasureText` (label → px) — no default, so each caller states its
  metric explicitly (the app injects a real canvas `measureText`; callers wanting the char-width
  metric pass the exported `heuristicMeasure`). `layout(ast, seed, measure)` likewise takes `seed`
  explicitly (empty map = clean, non-empty = relax).
- All five pure layouts return **`Result<Scene, LayoutError>`** and fail loudly on an internally-
  inconsistent AST (an edge/relation/message/link endpoint that isn't a known node, or — c4/cloud — an
  element whose `parent` is dangling/cyclic so it was never placed) instead of silently placing it at
  the origin or dropping the edge. The shell `layoutDiagram` already returns a `Result`, so the
  per-family error threads straight through to the caller.
- `layoutDiagram(ast)` routes by family: flowchart, **state, ER, class, and requirement** → ELK
  (async; state via `stateToFlow` and then restores `SceneNode.role` for initial/final/fork/join/note
  glyphs and repositions notes according to `right`/`left`/`over`, ER via `layoutEr`, class via
  `layoutClass`, requirement via `layoutRequirement`); the rest
  (sequence, C4, block, network, cloud, **gitGraph**, **timeline**,
  **mindmap**, **pie**) → pure layouts.
- **mindmap (`layoutMindmap`):** a deterministic **radial** layout (no ELK) — the root sits at the
  centre and each subtree fans into an angular sector sized by its leaf count, depth → radius; a forest
  rings its roots around a virtual hub. Nodes are shaped (hexagon → diamond, widened by the diamond's
  inscribed-rect condition so the label fits inside the sloped sides), edges arrowless spokes.
- **pie (`layoutPie`):** a deterministic radial layout — slices sized by share of the total, laid
  clockwise from 12 o'clock. `pie donut` slices get an inner radius while legend swatches stay full
  discs. Output is a `Scene` carrying only `wedges` (the SceneGraph radial primitive); no nodes/edges.
- **gitGraph (`layoutGitGraph`):** deterministic lane layout — commits in creation order along the main
  axis, one lane per branch on the cross axis (`LR` default; `TB`/`BT` swap/flip the axes); commits are
  circle nodes (`HIGHLIGHT` → rect), branch names round head nodes, one edge per parent (fork out at a
  `branch`, fan in at a `merge`). Classic emits each commit's id and `tag:` as adjacent captions
  (Mermaid parity — the bare dot carries no label); Pills folds both into the pill label instead.
- **timeline (`layoutTimeline`):** deterministic column layout — periods in a spine-joined left→right
  row (rounded header nodes), each period's events stacked as rects in its column below it, and a
  `container` band above each contiguous `section` run. Columns sized to the widest label.
- **Diagram titles (gantt/pie/timeline):** `withTitle` (`core/title.ts`) shifts the scene down one
  `TITLE_BAND` and adds the parsed `title` as a centred caption above the chart — Mermaid draws titles;
  these three families' ASTs carry one.
- **Gantt milestones:** a compact `BAR_HEIGHT`-square diamond centred on its date with the label as an
  adjacent caption to its right (Mermaid puts milestone text beside the marker); the dependency hook
  enters a milestone at its right corner so it never crosses the diamond body.
- **Compartment families (ER, class, requirement)** share one engine, `layoutCompartments`: each
  family maps its AST to `CompartmentBox`/`CompartmentEdge` specs + a metrics record (direction, title/
  row/subtitle heights, padding, min width), and the engine sizes each box to its rows (a flowchart
  node can't), runs ELK directly (not via `toElkGraph`), and builds the Scene. `EdgeEnd` subsumes ER
  crow's-foot cardinalities and UML class arrowheads, so each family's ends assign through unchanged.
  - **ER (`layoutEr`):** attribute rows; `ErCardinality` ends; solid = identifying / dashed = not.
  - **Class (`layoutClass`):** fields then methods (split by `rowDivider`); a `«stereotype»` subtitle;
    `ClassArrow` ends; dashed for the `..` operators.
  - **Requirement (`layoutRequirement`):** a `«kind»` tag (own compartment) + `key: value` rows;
    open-arrow edges, solid for `contains` / dashed for the rest.
- **Shared core helpers:** `core/measure.ts` (`widestLine` = widest measured line via `reduce`, total
  on a pathological many-line label; `clampedWidth(text, measure, min, pad)` = `max(min, widestLine+pad)`)
  and `core/grid.ts` (`gridGeometry(items, columns, cellWidth, cellHeight, gap)` → each item paired with
  its row-major cell corner + the overall extent). The grid skeleton (block/network) and the per-family
  `*Width`/`widestLine` idioms (block/network/cloud/c4/transform/sequence/mindmap/timeline) now route
  through these, each keeping its own `MIN_*`/`PAD` constants. The shell error idiom in `elk.ts` uses
  `messageOf` from `@m/std`.
- **Container-title routing guard:** `edgesAvoidContainerHeaders(scene)` rejects routes that cut through
  a container's visible title label. Tidy ELK candidates are maze-rerouted before `styleOk` selection, so
  flowchart subgraphs/swimlanes get the same title-protection as spread-routed architecture families.
- **Cross-boundary child routes:** `spreadPorts` chooses entry/exit sides using a child node's containing
  group when the other endpoint is outside that group, then anchors on the real child box. This keeps
  grouped architecture links entering tiers from the expected side without changing sibling-in-group
  routing.
- **Side-centre mount cleanup:** `layoutDiagram` applies `snapSceneEdgesToMountPoints` only to
  flowchart/ER/class/requirement, moving corner-ish edge endpoints to top/bottom/left/right side centres
  while leaving architecture spread families and semantic families untouched.
- **Cardinal mount invariant:** `cardinalMountViolations(scene)` reports edge/node/end/endpoint details
  for any non-self edge whose first or last waypoint is not on a node's top/bottom/left/right mount;
  `edgesUseCardinalMounts(scene)` is the boolean form.
- tests: 165 unit + 24 integration (toElkGraph/toScene incl. square circle nodes + subgraph hierarchy
  (container + absolute member coords); clean layout; relax; sequence; C4; block/network grid; cloud
  nesting + icons; injected-measurer sizing; routing; per-family **fail-loudly** cases for unknown
  endpoints and dangling parents; state role restoration; property-based: `widestLine`/`clampedWidth`
  (bounds + totality), `gridGeometry` (order/placement/containment), block/network grids **and the ELK
  flowchart path** preserve ids + fit every box inside the extent).
- **Candidate Sorting & Optimization Cost:** Differentiated crossings and overlaps in `minimizeCrossings` with a split cost function (`CROSSING_COST = 10` for perpendicular crossings and `OVERLAP_COST = 150` for parallel overlaps) applied globally across greedy sweeps and ILS passes. This allows short paths with minor crossings while strictly avoiding parallel overlaps.
- **Trunk Routing:** Enhanced `trunkMerge` with A* maze-routed approaches for each edge's connection to the trunk backbone (preventing obstacle clipping), dynamic balanced trunk line placement centered within the routing channel (clamped to safe margins), and a minimum fan threshold of `2`. Playground UI defaults `trunkEnabled` to `true` on first load.
- **Unified Layout Style Option:** Wired unified `layoutStyle` string parameter through the layout entry points (`layout`, `layoutDiagram`), mapping styles (classic, tidy, organic, relaxed, bus, trunk) to the internal routing pipelines and layout engine presets. Dynamic style dropdown replaces the isolated buttons in the playground UI, persisting the style preference per diagram family in local storage. Supported family custom styles include Classic vs Relaxed sequence (curved lines), Radial Spoke vs Classic mindmap (straight lines and rect nodes), Classic vs Donut pie charts, and Classic vs Pills gitGraph (empty circle commits and straight lines).
- **Self-Loops (c4/network/cloud):** Standardized self-loops to render as a 5-point right-angle loop at the top-right corner of the node, with the label positioned at the outer corner, resolving silent drops (Cloud) and degenerate dots (C4/Network).
- **Edge Label Decollision obstacle avoidance:** `decollideEdgeLabels` treats every node box —
  including the edge's own endpoint leaves — as an obstacle with a `LABEL_GAP` clearance ring, keeps
  related (ancestor) groups open EXCEPT their title band and four thin border strips (a label may live
  inside its own group but never straddles its outline or title), skips invisible `marker` nodes,
  searches cardinal then diagonal directions, and clamps every position — anchor, candidates, and the
  give-up fallback — onto the sheet so a label can never clip off the extent.
- **Facing-side group entry (`rerouteBoxEdges`):** entered groups contribute `enteredContainerWalls`
  (thin walls along the sides NOT facing the edge's other end) to the maze obstacles; sliding entries
  along an endpoint leaf's own border count as hugs in `routeBadness`; and the reroute picks from maze
  candidates plus orthodox L/Z `patternCandidates` by fewest hits → least on-screen badness → shortest,
  so a connector into a group enters once, through the side facing its source, arriving perpendicular.
- **Block composite width floor:** a `block:id` composite whose content needs more columns than its
  parent grid offers keeps its natural content width (it spans the full row) instead of being
  column-snap-clamped below its children — members no longer poke over the group border.
