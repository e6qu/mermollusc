# @m/renderer — work log

- Added ratio-based routed-label helpers (`edgeLabelAnchorAt`, `pathRatioNearest`) and exported them
  through the public renderer barrel so app overlays can move labels along the exact rendered route.
- `labelLines` now defines multiline splitting for both actual newlines and literal `\n`; canvas and SVG
  use it, keeping exports and on-screen rendering in parity.
- Edge-label plates are translucent in both canvas and SVG, reducing the opaque block effect while still
  keeping strokes from cutting through label text.
- Plated edge labels now use 66% opacity for both their background plate and text foreground in canvas
  and SVG exports.

## 2026-06-30 — Architecture accent rendering

- Added compute/data/network/security/ops accent fills.
- Preserved container accents in the display list so cloud/network groups regain colour.
- Extended contrast coverage for the expanded accent set.

- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- core: `DrawCmd` union + `toDisplayList` (Scene → display list); shapes by `SceneNode.shape`,
  centered labels, edge polylines.
- shell: `Canvas2D` structural interface + `paint(ctx, cmds)` painter (rounded boxes, diamonds,
  polylines, text).
- tests: display-list unit + paint integration via a recording mock context (4 passing).
- Honored `SceneEdge.stroke`/`arrow`: dashed line support (`setLineDash`) + filled arrowheads;
  layout maps flowchart `EdgeKind` → stroke/arrow.
- Draw `SceneEdge.label` at the edge midpoint (sequence message text + flowchart edge labels).
- Render the `"container"` shape (rounded outline + label near the top) for C4 boundaries.
- Added an `icon` draw command: nodes with a `SceneNode.icon` get a glyph stacked above the label;
  `paint` takes an `iconImages` map (`${pack}/${name}` → pre-rasterised image) and `drawImage`s it,
  skipping the glyph if no image was supplied. +2 tests (display-list icon cmd, paint drawImage).
- Added a `Theme` parameter (`defaultTheme`) — node fill / stroke / text colours + font, replacing
  the hardcoded palette; `drawArrowHead` takes the stroke colour. +1 test.
- Added a `background` field + a `darkTheme` palette (the app fills the canvas surface with it).
- Added a `Theme.sketch` hand-drawn mode: boxes/diamonds/solid edges drawn as wobbly double-stroked
  outlines via a seeded LCG jitter (deterministic, structural-`Canvas2D`-only — evaluated rough.js but
  a self-rolled sketch keeps the mock tests + no dep). Dashed edges/arrowheads stay crisp. +1 test.
- Added `htmlInCanvasSupported()` — feature-detection for the experimental "HTML in Canvas" API
  (false everywhere stable; detection-only scaffolding, no backend, no dependency). +1 test.
- Fixed edge-label placement: anchor at the midpoint *along the routed polyline* (half arc-length)
  nudged perpendicular to the local segment, replacing the average-of-endpoints anchor that could
  land a label inside a node when an orthogonal edge bends around one (e.g. a flowchart branch
  routing down the side). Pure `edgeLabelAnchor` helper in `display.ts`.
- Added `toSvg(cmds, opts)` (shell): a vector SVG backend over the same `DrawCmd[]` display list the
  canvas painter uses — box→`<rect>`, diamond→`<polygon>`, polyline→`<polyline>` (+ a reusable
  `<marker>` arrowhead), label→`<text>` (escaped), icon→`<image href>` from a `pack/name`→href map.
  Pure string output, crisp shapes only (sketch jitter is a screen affordance). Backs the app's SVG
  export. +4 unit tests.
- Adopted the `Coordinate`/`Length` geometry split in the `DrawCmd` display list: positions
  (`x`/`y`/`cx`/`cy`) are `Coordinate`, extents (`width`/`height`/`radius`/`size`) are `Length`;
  `px()` call sites became `coordinate()`/`length()`.
- Exported `edgeLabelAnchor` so hosts can align overlays (like the playground's inline edge-label
  editor) with the renderer's routed-polyline label placement. +1 unit test.
- Labels may now contain newlines: `paint` and `toSvg` split a label on `\n` and stack the lines
  centred on the anchor (single-line labels are unchanged). Used by C4 element descriptions; a
  general capability for any multi-line label. +1 unit test (stacked <tspan>s).
- Multi-line label continuation lines now render as a secondary style: `paint` draws them in a
  scaled-down font with lower `globalAlpha`; `toSvg` emits a smaller `font-size` + `fill-opacity` on
  the trailing `<tspan>`s. This gives C4 element descriptions the proper smaller/dimmed look under the
  label (added `globalAlpha` to the `Canvas2D` structural type). +1 unit assertion (styled tspan).
- Added **per-edge-end markers** for ER crow's-foot cardinality (and future UML heads). The polyline
  `DrawCmd` now carries `fromMarker`/`toMarker` (precomputed in the core from `SceneEdge.fromEnd/toEnd`)
  instead of a single `arrow` boolean: each `EndMarker` is backend-agnostic geometry — stroked `lines`
  (perpendicular bars for "one", a three-prong fan for "many"), a filled `triangle` (arrowhead), and a
  stroked `circle` (the optional "zero" ring). `paint` (added `arc` to `Canvas2D`) and `toSvg`
  (`<line>`/`<circle>`/`<polygon>`, dropping the old `<marker>` def) render identical glyphs.
- Rendered ER **attribute compartments**: a node with `rows` draws a title band, a divider polyline,
  and one left-aligned row per attribute. Added a `LabelAlign` (`center`/`left`) field to the label
  `DrawCmd`; `paint` sets `textAlign`, `toSvg` sets `text-anchor`. +5 unit/integration assertions
  (marker geometry per cardinality, degenerate-edge fallback, compartment rows, canvas arc, SVG
  circle/line). Raised the coverage ratchet.
- Generalised end markers for **UML class heads**: `EndMarker.triangle` became a `polygons` list of
  `{ points, fill }` where `fill` is `solid` (stroke-coloured arrowhead / composition diamond) or
  `hollow` (background-filled + outlined inheritance triangle / aggregation diamond), plus an
  open-arrow `arrowOpen` (a stroked V) for association/dependency. `paint`/`toSvg` fill+outline per
  mode. Rendered the class field/method **inner divider** via `SceneNode.rowDivider`. +2 integration
  assertions (canvas hollow head + divider, SVG background-filled polygon) and +1 unit (each UML
  head's geometry). Raised the coverage ratchet again.
- Polish: **edge labels now draw on a background plate** (a `plate` flag on the label `DrawCmd`, true
  for edge labels) so the routed line + end markers no longer strike through the text — a legibility
  win on short edges (e.g. an ER verb between two close entities). `paint` measures the widest line
  (added `measureText`/`fillRect` to the `Canvas2D` structural type) and fills a background box; `toSvg`
  emits a background `<rect>` sized from an em estimate. Node/title/row labels keep `plate: false`
  (they sit on a filled box already). +1 unit assertion (edge vs node label plating).
- Polish: `toDisplayList` now emits **three layers** — edge lines + end markers, then nodes, then
  edge labels — instead of all-nodes-then-all-edges. A straight centre-to-centre link (network/cloud/
  block) that passes a node is now cleanly occluded by the box instead of slicing across it; ELK
  families are unaffected (edges already route to the boundary, so arrowheads stay visible), and edge
  labels ride on top so their plate stays readable. +1 unit assertion (layer order).
- Sketch-mode consistency: edge-end **marker line segments** (crow's-foot prongs, cardinality bars,
  the open-arrow V) now wobble with the hand-drawn edge they sit on, instead of staying crisp; filled
  heads (arrowhead, composition diamond) stay solid, matching how sketch leaves shape fills alone.
  Verified compartment (ER/class) boxes already sketch correctly. +2 integration assertions
  (compartment box wobbles; sketch markers stroke strictly more than crisp).
- Compartment subtitle: a `SceneNode.subtitle` (a class `«stereotype»`) renders as a centred line
  above the title, widening the title band by `SUBTITLE_H` (matches the layout) so the divider and
  rows still land correctly. +1 unit assertion (subtitle above title, divider lowered).
- `toSvg` gained a required `origin` (scene-space) in `SvgOptions`; the draw group translates by
  `margin − origin`, matching the canvas painter, so content dragged to negative coordinates isn't
  clipped in the SVG export (part of the external-review extent fix). +1 unit assertion.
- Added a `wedge` `DrawCmd` (a filled pie sector) and rendered it in both backends: the canvas painter
  draws an `arc` sector, the SVG backend a `<path>` sector — both using the same shared categorical
  palette (`wedgeColor`) so a slice is identical in both. `toDisplayList` emits a wedge + a centred
  percentage label (on a plate) per `scene.wedges` entry; the existing node/edge families are untouched
  (their `wedges` array is empty). +2 unit tests (display list + SVG path).
- Added **DOT export** (`core/dot.ts`): `toDot(scene)` serialises the Scene (the universal graph IR) to
  Graphviz DOT text — the reverse of the parser's DOT import, and usable for *any* node/edge family. It
  maps `NodeShape`→DOT shape (`round`/`stadium`→a rounded box) and each `EdgeEnd`→a Graphviz arrowtype
  (`none`/`vee`/`onormal`/`diamond`/`odiamond`/crow's-foot `tee`/`crow` etc.), carries dashed strokes
  and labels, escapes ids/labels, and emits an empty `digraph {}` for a node-less (pie) scene. +4 tests.
- A **full-circle** `wedge` now renders as a legend swatch: the painter/SVG draw a clean disc (no centre
  vertex; SVG uses `<circle>` since an arc can't close a full turn) and `toDisplayList` places its label
  to the right, left-aligned. A partial wedge (a pie slice) is unchanged except its on-slice label is
  now just the percentage (the name moved to the pie legend). +2 unit tests (legend label + `<circle>`).
- `toDot(scene, rankdir)` now carries the source diagram's flow direction into the export as
  `rankdir=…` (null for families without one). Closes the DOT-export direction follow-up. +1 test.
- `toDot` now re-emits a Scene's `container` nodes as `cluster_*` subgraphs (label + nested members),
  so a flowchart subgraph / imported DOT cluster round-trips back to a DOT cluster. +1 test.
- Added a **curve primitive**: the polyline `DrawCmd` gained a `curved` flag; a curved 2-point edge
  draws as a cubic bezier bowed along its dominant axis (shared `bezierControls` helper → identical in
  the canvas painter and the SVG `<path>` backend). `toDisplayList` also emits **per-end labels** from
  `SceneEdge.fromLabel`/`toLabel` (class multiplicity), anchored just inside each endpoint. +tests.
- Type-system hardening + coverage: the canvas painter's `DrawCmd` switch gained a
  `default: assertNever(cmd)` so a new draw command can't be silently dropped on the canvas (the SVG
  backend was already exhaustive-by-return). Closed the **red `make cov` gate** (display.ts/paint.ts had
  drifted below the ratchet): added focused tests for `bezierControls` (both axes), `cornerRadius` per
  shape, `edgeLabelAnchor`'s multi-segment + degenerate paths, the curved-bezier paint/SVG paths, the
  icon-miss SVG branch, and `defaultSvgOptions`. Coverage rose (lines 90→98), so the ratchet was raised
  to statements 97 / branches 84 / functions 97 / lines 98.
- `SceneEdge.waypoints` is now `TwoOrMore<Point>`: `toDisplayList` dropped its `if (pts.length < 2)
  continue` (a silent skip — an edge that didn't draw) and the now-redundant first/second undefined
  guards, since `waypoints[0]`/`[1]` are total.
- Node fill accents: the `box` draw command carries a node's `accent`, and a new `accentFill(accent,
  theme)` maps it to a theme-aware colour (luminance-picked light/dark palette, like `wedgeColor`),
  exhaustive with `assertNever`. `none` is the ordinary fill; `muted`/`active`/`danger` tint a Gantt
  bar by status in both the canvas painter and the SVG backend. +accentFill test (all accents, both
  themes, distinctness).
- `Scene.decorations`: `toDisplayList` maps each `Decoration` to an existing draw command (a `rule` → a
  markerless dashed polyline, a `caption` → a plateless label), prepended so the chrome draws behind
  the nodes/edges. No new `DrawCmd` kinds — `decorationCmd` is exhaustive-by-return. +decoration test.
- Added a `band` `DrawCmd` (filled, strokeless background rect) + a theme-aware `bandFill(fill, theme)`
  (mirrors `accentFill`): `section`/`sectionAlt` faint zebra shades and a greyer `excluded`. `decorationCmd`
  maps a `band` decoration to it; both canvas + SVG backends render it. +display/paint/svg tests.
- Type-correctness nits from the core audit: `toDot` now omits a default (`normal`) arrowtail instead of
  coalescing `null → "normal"`, mirroring the arrowhead (consistent null-means-default handling); and
  `WEDGE_PALETTE` is typed as a non-empty tuple so `wedgeColor`'s in-range fallback names the definite
  first slot rather than duplicating a colour literal. +1 dot test (default vs named tail).
- Accessibility — palette contrast guard: a WCAG audit measured every node-label-on-accent pair and node
  stroke; all clear AA (text ≥ 5.25:1 vs the 4.5 floor, strokes ≥ 5.7:1 vs the 3.0 floor, both themes).
  Added a regression test that computes the relative-luminance contrast ratio over `accentFill`/theme
  colours and asserts the thresholds, so a future palette tweak can't silently drop below AA. +2 tests.
- State-marker polish: `toDisplayList` now maps `SceneNode.role` to dedicated commands for filled start
  markers, ringed final markers, fork/join bars, and folded state notes. Canvas and SVG both render the
  commands, and sketch-mode boxes keep a subtle fill under the wobbly outline so large diagrams no
  longer look hollow. +display/paint/svg tests.
- Donut wedges: the `wedge` display command now carries `innerRadius`; canvas and SVG draw annular
  sectors when it is non-zero while keeping full-circle legend swatches as discs. +display/SVG tests.
- Contrast: fixed the dark Gantt `sectionAlt` band (was identical to the background → invisible zebra);
  the three band fills are now mutually distinct and each distinct from the background. +unit test.
- `toDot` correctness: skip invisible `marker` nodes (a pie now exports as an empty graph instead of
  orphan slice boxes) and stop double-prefixing a container id with `cluster_` (a re-exported DOT import
  grew `cluster_cluster_…` each round-trip). Corrected the now-accurate comments.
- `smoothSegments`: a Catmull-Rom→bezier spline through every edge waypoint, so a multi-segment routed
  edge can render as one flowing curve (keeping its arrowhead). Canvas + SVG backends both use it for a
  curved edge with >2 points; the existing 2-point bezier (mindmap/gitGraph) is unchanged.
- `roundedCorners`: a rounded-corner path (straight legs + a quadratic arc at each bend), so a "curved"
  edge route curves only AT the corners, not as a continuous spline. Replaces the multi-point
  `smoothSegments` rendering for curved edges (the 2-point mindmap/gitGraph bezier is unchanged).
- New `actor` DrawCmd: a stickman (head + body + arms + legs) drawn to fit a node's box, in both the
  canvas and SVG backends. `nodeCmds` emits it for `shape: "actor"` (with the label on the bottom row).
- Per-segment direction hints: a directed edge (arrow / open-arrow / triangle head) now carries a small
  open chevron on EVERY segment of its route, pointing the way flow travels, so direction is legible on
  each leg of a multi-bend orthogonal connector — not only at the head. Computed in `toDisplayList`
  (`directionHints`) as lightweight `EndMarker`s (same `lines` shape as `arrowOpen`), so both the canvas
  and SVG backends draw them with the existing marker path and the edge's stroke colour. Undirected and
  curved edges, and segments shorter than a chevron, get none. Reverse-directed edges (head at the source)
  point the hints backward.
- Bus junctions (opt-in rendering): `toDisplayList(scene, drawJunctions)` can mark, with a small filled
  dot, every point where one edge branches off a backbone another edge continues along — a waypoint of A
  inside a collinear segment of B. A plain crossing isn't collinear, so it isn't marked. New `junction`
  DrawCmd, drawn by both backends (a stroke-coloured dot). Off by default — only the app's Bus toggle asks
  for it.
- Edge-label plates now have enough padding to read as intentional callouts in canvas and SVG, rather
  than tight white cuts that made labelled network/cloud connectors look busier than the routes were.
- Crossing Cues / visual hops: Added a new `PathCmd` type. `toDisplayList` now finds intersections between non-joining edges, and generates a visual crossing hop (crossover) using a quadratic Bezier curve on horizontal segments. Both canvas (`paint.ts`) and SVG (`svg.ts`) backends render the consolidated vector paths. Added unit tests for crossing hops.
- Renderer core cleanup: moved route/path geometry out of `display.ts` into `src/core/path.ts`.
  `display.ts` now stays focused on lowering `Scene` nodes/decorations/edges into layered `DrawCmd`s,
  while `path.ts` owns `PathCmd`, bezier controls, rounded routed corners, crossing detection, and hop
  construction. Existing canvas/SVG parity tests and crossing-hop coverage stay green.
