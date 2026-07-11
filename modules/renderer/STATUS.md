# @m/renderer — status

**State:** Canvas2D renderer implemented; `make check` green.

**Current architecture note:** the default themes now match real Mermaid's appearance — palette AND
font taken from mermaid's own `theme-default.js` (`mainBkg #ECECFF`, `border1 #9370DB`, text/line
`#333`, `16px "trebuchet ms", verdana, arial, sans-serif`), with `Theme.nodeStroke` split from
`Theme.stroke` so node borders can be Mermaid-purple while lines stay dark, exactly like Mermaid.
`toDisplayList(scene, drawJunctions, plainEdges)` carries a `plainEdges` flag: the
classic/Mermaid-parity look drops the two house edge decorations (per-segment direction chevrons and
crossing "hop" arcs), which real Mermaid does not draw. Classic additionally draws the ELK layered family's edges as smooth
Catmull-Rom splines through the routed waypoints (`EdgeFinish = "decorated" | "plain" | "spline"`) —
the last appearance-level parity gap closed; what remains is the engine difference (ELK vs dagre, a
layout concern). Container display boxes honor
`SceneNode.accent`, and the palette maps semantic cloud/network accents to theme-aware colours — the
dark-theme accent fills are desaturated (~25–32% HSL saturation, the dark counterpart of the light
pastels) so dark-mode cloud group panels don't glow; a saturation + WCAG-contrast test guards both.
Edge labels render per `labelStyle` (see the label bullet below): 75%-alpha text, lifted plateless
above a horizontal run, or kept in-channel on a small opaque masking plate when a line would cross the
text.

- core (pure): `toDisplayList(scene)` → `DrawCmd[]` (box/diamond/state-marker shapes, node labels, edge
  polylines with dashed/solid stroke + per-end markers, edge labels anchored by exported
  `edgeLabelAnchor`/`edgeLabelAnchorAt` along the routed polyline — perpendicular-nudged, so a bent
  edge's label stays in the routing channel rather than landing on a node — and an `icon` command —
  glyph above the label — for nodes carrying a `SceneNode.icon`). Emitted in three layers — edge
  lines + markers, then nodes, then edge labels — so nodes occlude crossing links while labels stay on top.
- core pathing: `src/core/path.ts` owns bezier controls, rounded routed corners, crossing detection,
  and visual hop `PathCmd`s. `toDisplayList` asks it for edge paths, keeping scene-to-display
  layering separate from route geometry.
- **Diamonds:** the `diamond` `DrawCmd` carries the same `accent`/`fill`/`stroke` fields as `box`, so
  decision diamonds honour colour accents and raw `style`/`classDef` directives, and a diamond node's
  `icon` renders (glyph stacked above the label, the pair centred inside the shape) — in both
  backends.
- **Pie wedges:** a `wedge` `DrawCmd` (filled circular sector) renders `scene.wedges` — the canvas
  painter draws an `arc` sector (or annular sector for donuts: outer arc forward, inner arc swept
  BACK anticlockwise so the hole stays open — `Canvas2D.arc` requires the direction argument so this
  can't regress silently), the SVG backend a `<path>` sector,
  both filled from a shared categorical palette (`wedgeColor(colorIndex)`) so a slice matches across
  backends. `toDisplayList` pairs each slice with a centred percentage label and each full-disc legend
  swatch with a left-aligned label. Node/edge families carry no wedges, so they're unaffected.
- **Edge-end markers:** the polyline `DrawCmd` carries a `fromMarker`/`toMarker` `EndMarker`,
  precomputed from `SceneEdge.fromEnd`/`toEnd` — backend-agnostic geometry: stroked `lines` (the
  open-arrow V, the `|` bars, the three-prong "many" fan), `polygons` (`{ points, fill }` — `solid`
  arrowhead / composition diamond, `hollow` inheritance triangle / aggregation diamond), and a stroked
  `circle` (the "zero" ring). This renders ER crow's-foot cardinality **and** UML class heads;
  `paint` and `toSvg` draw identical glyphs from the same primitives.
- **Compartment boxes:** a `SceneNode.rows` node (ER entity / UML class) draws a title band, a
  divider, and one left-aligned row each (the `label` `DrawCmd` carries a `LabelAlign`); a non-null
  `rowDivider` adds a second divider at that row index — the UML class field/method split; a non-null
  `subtitle` (a class `«stereotype»`) draws a centred line above the title, widening the title band.
- **State roles:** `SceneNode.role` maps to dedicated display commands for filled initial markers,
  ringed final markers, fork/join bars, and folded-note boxes; both canvas and SVG exports draw them
  from the same display list.
- multi-line labels: a `label` whose text contains an actual newline or a literal `\n` is drawn as stacked lines centred on the
  anchor (in both `paint` and `toSvg`); single-line labels are unchanged. The first line is the
  primary label; continuation lines (a C4 description) render smaller and dimmed.
- labels carry a `labelStyle: "node" | "edge" | "edge-masked"` union (there is no boolean `plate`
  flag): `"node"` is full-opacity text (node/title/row/decoration labels); `"edge"` is 75%-alpha text
  with NO background — a horizontal edge label lifted `LABEL_LINE_CLEARANCE` (16px) above its line;
  `"edge-masked"` is 75%-alpha text on a small OPAQUE background-colour plate that masks the line —
  used for vertical-run labels (kept in-channel instead of dodging sideways) AND for any lifted label
  whose text box another edge line would still cross (its own bend, or the lifelines a sequence
  message spans — sequence message labels therefore always render masked). `paint` measures the plate
  from the widest line; `toSvg` estimates it (0.6em per glyph).
- shell: `paint(ctx, cmds, iconImages?, theme?)` executes the display list against a `Canvas2D`
  (structural subset of `CanvasRenderingContext2D`; a real 2D context is assignable). `iconImages`
  maps `${pack}/${name}` → a pre-rasterised `CanvasImageSource` (missing → glyph skipped); `theme`
  (`Theme` — `defaultTheme` light / `darkTheme`, each with a `sketch` flag) supplies the surface +
  node/stroke/text colours + font.
- shell: `toSvg(cmds, opts)` — a **vector SVG backend** over the same `DrawCmd[]` display list (box
  → `<rect>`, diamond → `<polygon>`, polyline → `<polyline>` + inline `<line>`/`<circle>`/`<polygon>`
  end markers, label → `<text>` (`text-anchor` per `LabelAlign`), icon → `<image href>` from a
  supplied `pack/name`→href map). Pure string output; renders
  the crisp shapes (no sketch jitter). Backs the app's "SVG" export.
- core: `toDot(scene)` — a **Graphviz DOT** text backend over the Scene itself (not the display list),
  so any node/edge family exports to DOT: nodes → `"id" [label, shape]`, edges → `"from" -> "to"
  [label, arrowhead]` with `NodeShape`/`EdgeEnd` mapped to DOT shapes/arrowtypes. The reverse of the
  parser's DOT import; backs the app's "DOT" export.
- device-pixel-ratio is the app's concern (it sizes the backing store); the renderer draws in CSS px.
- **Sketch mode** (`theme.sketch`): boxes get a subtle fill plus wobbly outlines; diamonds/solid edges
  and edge-marker line segments
  (crow's-foot prongs, bars, open-arrow V) — become wobbly, double-stroked hand-drawn outlines via a
  seeded LCG jitter — deterministic, using only the structural `Canvas2D` (no rough.js dep,
  so the mock-based tests still hold). Dashed edges and filled marker heads stay crisp/solid.
- `htmlInCanvasSupported()`: feature-detects the experimental "HTML in Canvas" API (Chromium-flag
  only; false everywhere stable) so a host could opt into a richer backend if it ships — detection
  only, the default `paint` path is always used.
- tests (see `make test`): display-list/path unit incl. icon/edge-label anchor and crossing hops;
  paint mock — drawImage/theme/sketch; html-in-canvas detect; `toSvg` — shapes/escaping/icon
  `<image>`.
