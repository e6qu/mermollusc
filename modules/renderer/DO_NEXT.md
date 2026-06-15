# @m/renderer — do next

- Sketch mode is in (self-rolled seeded jitter; `theme.sketch`, app toggle). Possible upgrades:
  swap to **rough.js** (MIT) for hachure fills if richer texture is wanted, and bundle a handwriting
  font — **Patrick Hand** (OFL, google/fonts) woff2 + provenance — instead of the system cursive stack.
  Companion: an authored AGPL `sketch` glyph pack (stickman/wobbly) for a fully hand-drawn look.
- Measure text via the context and feed real node sizes back to layout (replace the heuristic).
- Add per-element theming (e.g. distinct colours per node shape / diagram family).
- Add the HTML-in-Canvas (`drawElement`) enhancement path behind feature detection.
- Add golden/pixel tests in `app` once the pipeline is wired end-to-end.
