# @m/renderer — do next

- **Mermaid font parity.** The default palette now matches mermaid's `theme-default.js`, but the font is
  still `14px sans-serif` vs Mermaid's `16px "trebuchet ms"` — changing it resizes every node (the font
  feeds `measureText`), which shifts every golden and the e2e pixel coordinates, so it needs its own
  sweep with visual re-verification rather than riding along on a palette change.
- **Mermaid edge-geometry parity.** Classic mode now drops the house chevrons/hops, but edges are still
  rounded-corner orthogonal polylines; real Mermaid draws smooth splines (basis curves). A classic-mode
  spline `PathCmd` builder over the same waypoints would close most of the remaining visual gap.
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
- Add golden/pixel tests in `app` once the pipeline is wired end-to-end.
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
