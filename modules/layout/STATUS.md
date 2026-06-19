# @m/layout — status

**State:** flowchart layout + relax (semi-interactive) implemented; `make check` green.

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
- `layoutSequence(ast)` (pure): actors row, vertical dashed lifelines, stacked message arrows.
- `layoutC4(ast)` (pure): nested-box layout — boundaries wrap their children; relations are
  straight centre-to-centre edges.
- `layoutBlock(ast)` (pure): row-major grid in a `columns`-wide uniform cell; straight
  centre-to-centre edges.
- `layoutNetwork(ast)` (pure): squarish (`ceil √n`) grid; undirected (arrowless) centre-to-centre
  links; sets each node's `icon` ref from its kind (`{ pack: "arch", name: kind }`).
- `layoutCloud(ast)` (pure): recursive nested-box — groups render as containers wrapping children;
  each service leaf's kind maps to a vendored simple-icons glyph (`docker`/`postgresql`/`apachekafka`/
  `cloudflare`/`googlecloudstorage`); undirected links.
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
  (async; state via `stateToFlow`, ER via `layoutEr`, class via `layoutClass`, requirement via
  `layoutRequirement`); the rest (sequence, C4, block, network, cloud, **gitGraph**, **timeline**) →
  pure layouts.
- **gitGraph (`layoutGitGraph`):** deterministic lane layout — commits in creation order along the main
  axis, one lane per branch on the cross axis (`LR` default; `TB`/`BT` swap/flip the axes); commits are
  circle nodes (`HIGHLIGHT` → rect), branch names round head nodes, one edge per parent (fork out at a
  `branch`, fan in at a `merge`).
- **timeline (`layoutTimeline`):** deterministic column layout — periods in a spine-joined left→right
  row (rounded header nodes), each period's events stacked as rects in its column below it, and a
  `container` band above each contiguous `section` run. Columns sized to the widest label.
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
- tests: 29 unit + 13 integration (toElkGraph/toScene incl. square circle nodes + subgraph hierarchy
  (container + absolute member coords); clean layout; relax; sequence; C4; block/network grid; cloud
  nesting + icons; injected-measurer sizing; routing; per-family **fail-loudly** cases for unknown
  endpoints and dangling parents; property-based: block/network grids **and the ELK flowchart path**
  preserve ids + fit every box inside the extent).
