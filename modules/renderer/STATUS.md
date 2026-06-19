# @m/renderer — status

**State:** Canvas2D renderer implemented; `make check` green.

- core (pure): `toDisplayList(scene)` → `DrawCmd[]` (box/diamond shapes, node labels, edge
  polylines with dashed/solid stroke + per-end markers, edge labels anchored by exported
  `edgeLabelAnchor` at the midpoint *along the routed polyline* — perpendicular-nudged, so a bent
  edge's label stays in the routing channel rather than landing on a node — and an `icon` command —
  glyph above the label — for nodes carrying a `SceneNode.icon`).
- **Edge-end markers:** the polyline `DrawCmd` carries a `fromMarker`/`toMarker` `EndMarker`,
  precomputed from `SceneEdge.fromEnd`/`toEnd` — backend-agnostic geometry: stroked `lines` (the
  open-arrow V, the `|` bars, the three-prong "many" fan), `polygons` (`{ points, fill }` — `solid`
  arrowhead / composition diamond, `hollow` inheritance triangle / aggregation diamond), and a stroked
  `circle` (the "zero" ring). This renders ER crow's-foot cardinality **and** UML class heads;
  `paint` and `toSvg` draw identical glyphs from the same primitives.
- **Compartment boxes:** a `SceneNode.rows` node (ER entity / UML class) draws a title band, a
  divider, and one left-aligned row each (the `label` `DrawCmd` carries a `LabelAlign`); a non-null
  `rowDivider` adds a second divider at that row index — the UML class field/method split.
- multi-line labels: a `label` whose text contains `\n` is drawn as stacked lines centred on the
  anchor (in both `paint` and `toSvg`); single-line labels are unchanged. The first line is the
  primary label; continuation lines (a C4 description) render smaller and dimmed.
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
- device-pixel-ratio is the app's concern (it sizes the backing store); the renderer draws in CSS px.
- **Sketch mode** (`theme.sketch`): boxes/diamonds/solid edges become wobbly, double-stroked
  hand-drawn outlines via a seeded LCG jitter — deterministic, no fill, using only the structural
  `Canvas2D` (no rough.js dep, so the mock-based tests still hold). Dashed edges/end markers stay crisp.
- `htmlInCanvasSupported()`: feature-detects the experimental "HTML in Canvas" API (Chromium-flag
  only; false everywhere stable) so a host could opt into a richer backend if it ships — detection
  only, the default `paint` path is always used.
- tests: 14 passing (display-list unit incl. icon/edge-label anchor; paint mock — drawImage/theme/sketch; html-in-canvas
  detect; `toSvg` — shapes/escaping/icon `<image>`).
