# @m/renderer — work log

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
