# @m/renderer — status

**State:** Canvas2D renderer implemented; `make check` green.

- core (pure): `toDisplayList(scene)` → `DrawCmd[]` (box/diamond shapes, node labels, edge
  polylines with dashed/solid stroke + optional arrowhead, edge labels anchored at the midpoint
  *along the routed polyline* — perpendicular-nudged, so a bent edge's label stays in the routing
  channel rather than landing on a node — and an `icon` command — glyph above the label — for
  nodes carrying a `SceneNode.icon`).
- shell: `paint(ctx, cmds, iconImages?, theme?)` executes the display list against a `Canvas2D`
  (structural subset of `CanvasRenderingContext2D`; a real 2D context is assignable). `iconImages`
  maps `${pack}/${name}` → a pre-rasterised `CanvasImageSource` (missing → glyph skipped); `theme`
  (`Theme` — `defaultTheme` light / `darkTheme`, each with a `sketch` flag) supplies the surface +
  node/stroke/text colours + font.
- device-pixel-ratio is the app's concern (it sizes the backing store); the renderer draws in CSS px.
- **Sketch mode** (`theme.sketch`): boxes/diamonds/solid edges become wobbly, double-stroked
  hand-drawn outlines via a seeded LCG jitter — deterministic, no fill, using only the structural
  `Canvas2D` (no rough.js dep, so the mock-based tests still hold). Dashed edges/arrowheads stay crisp.
- `htmlInCanvasSupported()`: feature-detects the experimental "HTML in Canvas" API (Chromium-flag
  only; false everywhere stable) so a host could opt into a richer backend if it ships — detection
  only, the default `paint` path is always used.
- tests: 9 passing (display-list unit incl. icon; paint mock — drawImage/theme/sketch; html-in-canvas detect).
