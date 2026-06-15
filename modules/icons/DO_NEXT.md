# @m/icons — do next

- Author an original AGPL `sketch` glyph pack (stickman/wobbly shapes) to pair with the renderer's
  planned hand-drawn "Sketch" mode (see `@m/renderer` DO_NEXT — rough.js + Patrick Hand, studied).
  (BPMN glyphs authored; simple-icons/devicon/gilbarbara/k8s bundled; CNCF archived via git-LFS.)
- Extend the curated simple-icons / gilbarbara slug lists as needed.
- BPMN: author original AGPL glyphs (bpmn-io/bpmn-font has no license — can't vendor). AliCloud and
  the official AWS/Azure/GCP/Oracle architecture sets are user-loaded (not redistributable).
- Hand-drawn/xkcd style: under study — a sketchy render mode vs. an authored stick-glyph pack.
- Extend the per-node `icon "<pack>/<name>"` override (now on network) to block/flowchart/C4 leaves.
- Cache rasterised glyphs in the renderer shell rather than the app.
