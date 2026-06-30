# @m/renderer — status

**State:** Canvas2D renderer implemented; `make check` green.

**Current architecture note:** container display boxes now honor `SceneNode.accent`, and the palette maps
semantic cloud/network accents to theme-aware colours.

- core (pure): `toDisplayList(scene)` → `DrawCmd[]` (box/diamond/state-marker shapes, node labels, edge
  polylines with dashed/solid stroke + per-end markers, edge labels anchored by exported
  `edgeLabelAnchor`/`edgeLabelAnchorAt` along the routed polyline — perpendicular-nudged, so a bent
  edge's label stays in the routing channel rather than landing on a node — and an `icon` command —
  glyph above the label — for nodes carrying a `SceneNode.icon`). Emitted in three layers — edge
  lines + markers, then nodes, then edge labels — so nodes occlude crossing links while labels stay on top.
- core pathing: `src/core/path.ts` owns bezier controls, rounded routed corners, crossing detection,
  and visual hop `PathCmd`s. `toDisplayList` asks it for edge paths, keeping scene-to-display
  layering separate from route geometry.
- **Pie wedges:** a `wedge` `DrawCmd` (filled circular sector) renders `scene.wedges` — the canvas
  painter draws an `arc` sector (or annular sector for donuts), the SVG backend a `<path>` sector,
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
- edge labels carry a `plate` flag: a padded translucent background box is drawn behind the text (so the routed line
  + end markers don't strike through it, and labels read as deliberate callouts instead of tight white
  cuts). `paint` measures the widest line; `toSvg` estimates it. Node/title/row labels keep
  `plate: false`.
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
