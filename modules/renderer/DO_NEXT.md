# @m/renderer — do next

- *(done)* **Mermaid font parity.** `defaultTheme`/`darkTheme` use Mermaid's own
  `16px "trebuchet ms", verdana, arial, sans-serif` (from `theme-default.js`, same provenance as the
  palette). The node-size shift this caused was absorbed by converting the affected e2e specs from
  hardcoded pixel offsets to the `__nodeRect`-anchored helpers in `e2e/support/nodes.ts` — new specs
  must use those helpers, never magic coordinates.
- *(done)* **Mermaid edge-geometry parity.** Classic mode draws smooth Catmull-Rom-derived cubic
  splines through the routed waypoints (`splinePath`, the `"spline"` `EdgeFinish`) for the ELK layered
  family — the Mermaid basis-curve look. The maze-routed box families keep straight lanes even in
  classic (`"plain"`): smoothing would cut corners into the obstacles their router avoided. Hit-testing
  and label anchors still use the waypoint polyline; the spline passes through every waypoint, so the
  deviation is bounded and the full e2e suite confirms interactions are unaffected.
- **Wire `make cov` into a gate.** The coverage ratchet had drifted ~10 points above actual on main with
  nobody noticing, because neither pre-commit nor pre-push runs `make cov`. Re-based 2026-07-02; decide
  where the gate runs (pre-push? CI?) so a ratchet miss actually fails something.
- Sketch mode is in (self-rolled seeded jitter plus subtle box fills; `theme.sketch`, app toggle).
  Possible upgrades:
  swap to **rough.js** (MIT) for hachure fills if richer texture is wanted, and bundle a handwriting
  font — **Patrick Hand** (OFL, google/fonts) woff2 + provenance — instead of the system cursive stack.
  Companion: an authored AGPL `sketch` glyph pack (stickman/wobbly) for a fully hand-drawn look.
- Add per-element theming (e.g. distinct colours per node shape / diagram family).
- *(done)* Multi-line labels render continuation lines (a C4 description) smaller and dimmed than the
  first line — `paint` scales the font + lowers `globalAlpha`; `toSvg` emits a smaller `font-size` +
  `fill-opacity` on the trailing `<tspan>`s.
- HTML-in-Canvas: `htmlInCanvasSupported()` detection is in; build the actual rich-label backend
  once the API ships in stable Chromium (it's flag-only today, so unverifiable here).
- *(mostly done)* Display-list goldens exist in `app` (`test/integration/golden.test.ts`, one per
  example); only the optional PIXEL golden (paint regressions rather than geometry) remains open.
- *(done)* Edge-label plates are padded in both canvas and SVG so labelled network/cloud connectors read
  as callouts, not text stamped directly onto the stroke.
- *(done)* Export `edgeLabelAnchor` so app overlays can share the renderer's routed edge-label
  placement.
- *(done)* Export ratio-based edge-label helpers so host overlays can drag labels along a route and
  preserve relative positions across rerenders.
- *(done)* Literal `\n` labels render as multiple lines in both canvas and SVG.
- *(done)* State-diagram `[*]` pseudo-states render as filled initial / ringed final markers; fork/join
  roles render as bars and state notes draw a folded corner.
- *(done)* ER crow's-foot cardinality renders via per-edge-end markers. `SceneEdge` now carries
  `fromEnd`/`toEnd` (`EdgeEnd` union, replacing the single `arrow`); `toDisplayList` precomputes each
  end's geometry as a backend-agnostic `EndMarker` (stroked `lines` for bars/prongs, a filled
  `triangle` for arrowheads, a stroked `circle` for the optional "zero" ring) so `paint` and `toSvg`
  draw identical glyphs. The same mechanism would serve class-diagram UML arrowheads. ER attribute
  rows render as compartment boxes (`SceneNode.rows`: title band + divider + left-aligned rows).
- *(done)* State-note placement is layout-owned now: note direction (`left`/`right`/`over`) reaches the
  scene and connectors re-anchor to the moved note boxes.
- *(done)* Donut pie slices render as annular sectors in both canvas and SVG; legend swatches remain
  full discs.
- DOT export: *(done — `toDot(scene, rankdir)` Graphviz backend; carries `rankdir`; `container` nodes
  re-emit as `cluster_*` subgraphs)*.
- route path cleanup: *(done — edge path construction, rounded routed corners, and crossing hops live
  in `src/core/path.ts`; both canvas and SVG consume the same `PathCmd`s)*.
- *(done)* Architecture accents now render for both leaves and containers, restoring colour to cloud and
  network diagrams without special-casing them in paint code.
