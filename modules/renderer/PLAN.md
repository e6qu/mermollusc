# @m/renderer — plan

`Scene → pixels` on an HTML canvas.

## Architecture accents

- Preserve semantic architecture colour intent from `SceneNode.accent` for leaves and containers,
  including cloud/network compute, data, network, security, and ops roles.

## Responsibility

- Owns turning a positioned `Scene` into drawing operations and executing them.
- The Scene→display-list step is pure and lives in `src/core`; touching a canvas context is IO,
  so it lives in `src/shell`.
- Does NOT lay out or hit-test (that's `@m/layout` / `@m/builder`).

## Public API (stable surface)

- `toDisplayList(scene: Scene): DrawCmd[]` (pure).
- `edgeLabelAnchor(points: readonly Point[]): { x, y }` (pure routed-polyline label placement).
- `edgeLabelAnchorAt(points, t)` and `pathRatioNearest(points, p)` (pure routed-polyline helpers for
  host overlays that move edge labels while preserving relative position).
- `labelLines(text)` splits both actual newlines and literal `\n` labels the same way for canvas, SVG,
  and host hit-testing.
- `paint(ctx: Canvas2D, cmds: readonly DrawCmd[]): void`.
- `toSvg(cmds, opts): string` shares the display list with the canvas backend for export.
- `Canvas2D` — structural subset of `CanvasRenderingContext2D`; a real context is assignable.
- Pie/donut wedges render through the same display-list `wedge` command in canvas and SVG.
- Edge route paths are built once in `src/core/path.ts` as backend-agnostic `PathCmd`s, including
  curved edges and crossing hops, then consumed by both canvas and SVG. The chevron/hop decorations are
  house additions: `toDisplayList`'s `plainEdges` flag (the classic/Mermaid-parity look) omits them.
- The default light theme is Mermaid's own default palette (provenance in `paint.ts`); `Theme.nodeStroke`
  is split from `Theme.stroke` because Mermaid borders nodes (purple) differently from its lines (dark).
- Edge labels render 75%-alpha in both canvas and SVG per the `labelStyle` union (`"node" | "edge" |
  "edge-masked"`): a horizontal-run label lifts above its line as bare text (transparency beats boxes
  on dense diagrams); a vertical-run label — or any lifted label another edge line would still cross,
  e.g. a sequence message spanning lifelines — stays in-channel on a small opaque plate that masks the
  line behind the text.

## Notes

- The `Canvas2D` seam keeps the core/shell split testable in node (mock context) and lets the
  HTML-in-Canvas backend slot in later as an alternative `paint` implementation.
