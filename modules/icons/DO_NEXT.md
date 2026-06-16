# @m/icons — do next

- Subdivide vendored brand packs into finer categories (devicon → language/framework/tool/cloud
  rather than one `brands`); add an "area"/region category + an icon-picker UI that groups by category.
- Grow the `sketch` pack (more hand-drawn glyphs) and let the cloud/network kind→icon maps switch to
  it when the app is in Sketch mode.
- AWS/Azure/GCP/Oracle/AliCloud official sets + any non-redistributable pack: user-load into the
  git-ignored `vendor/restricted/` via `tools/pack-dir.mjs` + the app's "Load icons" — see
  `vendor/restricted/README.md`. Bundleable packs live in `vendor/open/` (sourced by source-icons.mjs).
- Extend the curated simple-icons / gilbarbara slug lists as needed.
- BPMN: author original AGPL glyphs (bpmn-io/bpmn-font has no license — can't vendor). AliCloud and
  the official AWS/Azure/GCP/Oracle architecture sets are user-loaded (not redistributable).
- Hand-drawn/xkcd style: under study — a sketchy render mode vs. an authored stick-glyph pack.
- Extend the per-node `icon "<pack>/<name>"` override (now on network) to block/flowchart/C4 leaves.
- Cache rasterised glyphs in the renderer shell rather than the app.
