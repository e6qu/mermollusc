# @m/icons — do next

- Author an original AGPL `sketch` glyph pack (stickman/wobbly shapes) to pair with the renderer's
  hand-drawn "Sketch" mode.
- AWS/Azure/GCP/Oracle/AliCloud official sets + any non-redistributable pack: user-load via
  `tools/pack-dir.mjs` (local SVG dir → pack JSON) + the app's "Load icons" — see `vendor/README.md`.
  (BPMN authored; simple-icons/devicon(61)/gilbarbara/k8s bundled; CNCF archived via git-LFS.)
- Extend the curated simple-icons / gilbarbara slug lists as needed.
- BPMN: author original AGPL glyphs (bpmn-io/bpmn-font has no license — can't vendor). AliCloud and
  the official AWS/Azure/GCP/Oracle architecture sets are user-loaded (not redistributable).
- Hand-drawn/xkcd style: under study — a sketchy render mode vs. an authored stick-glyph pack.
- Extend the per-node `icon "<pack>/<name>"` override (now on network) to block/flowchart/C4 leaves.
- Cache rasterised glyphs in the renderer shell rather than the app.
