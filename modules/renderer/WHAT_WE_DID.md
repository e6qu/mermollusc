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
