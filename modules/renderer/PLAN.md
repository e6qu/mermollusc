# @m/renderer — plan

`Scene → pixels` on an HTML canvas.

## Responsibility

- Owns turning a positioned `Scene` into drawing operations and executing them.
- The Scene→display-list step is pure and lives in `src/core`; touching a canvas context is IO,
  so it lives in `src/shell`.
- Does NOT lay out or hit-test (that's `@m/layout` / `@m/builder`).

## Public API (stable surface)

- `toDisplayList(scene: Scene): DrawCmd[]` (pure).
- `edgeLabelAnchor(points: readonly Point[]): { x, y }` (pure routed-polyline label placement).
- `paint(ctx: Canvas2D, cmds: readonly DrawCmd[]): void`.
- `toSvg(cmds, opts): string` shares the display list with the canvas backend for export.
- `Canvas2D` — structural subset of `CanvasRenderingContext2D`; a real context is assignable.
- Pie/donut wedges render through the same display-list `wedge` command in canvas and SVG.
- Edge route paths are built once in `src/core/path.ts` as backend-agnostic `PathCmd`s, including
  curved edges and crossing hops, then consumed by both canvas and SVG.
- Edge labels are explicit callouts: both canvas and SVG draw a padded background plate behind labelled
  connectors so network/cloud labels stay readable without making the edge stroke look chopped up.

## Notes

- The `Canvas2D` seam keeps the core/shell split testable in node (mock context) and lets the
  HTML-in-Canvas backend slot in later as an alternative `paint` implementation.
