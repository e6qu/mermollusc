# @m/renderer — do next

- Sketch mode is in (self-rolled seeded jitter; `theme.sketch`, app toggle). Possible upgrades:
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
- *(done)* Export `edgeLabelAnchor` so app overlays can share the renderer's routed edge-label
  placement.
- State-diagram `[*]` pseudo-states currently render as plain circles (via the flowchart `circle`
  shape); small *filled* initial / ringed final markers would read more like real state charts —
  needs a dedicated marker shape or a start/end-aware draw.
