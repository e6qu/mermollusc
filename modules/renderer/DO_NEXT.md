# @m/renderer — do next

- **Hand-drawn / xkcd "Sketch" mode** (studied — verified): add a `Theme.sketch` flag; when on, route
  box/diamond/polyline cmds through **rough.js** (MIT, pin `roughjs` — latest stable ≥24h is 4.6.6 as
  of 2026-06; re-pin via `tools/pick-version.mjs roughjs` at build) on the Canvas2D, with a fixed
  `seed` for deterministic output. Pair with a handwriting font — **Patrick Hand** (OFL, in
  google/fonts), bundled woff2 + provenance. Core/display-list unchanged; the app toggles it beside
  Dark/Light. Vendored SVG logos stay crisp; for a fully sketchy look, add an authored AGPL `sketch`
  glyph pack (stickman/wobbly shapes) — companion task in `@m/icons`.
- Measure text via the context and feed real node sizes back to layout (replace the heuristic).
- Add per-element theming (e.g. distinct colours per node shape / diagram family).
- Add the HTML-in-Canvas (`drawElement`) enhancement path behind feature detection.
- Add golden/pixel tests in `app` once the pipeline is wired end-to-end.
