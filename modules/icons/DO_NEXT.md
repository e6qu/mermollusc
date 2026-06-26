# @m/icons — do next

- Subdivide vendored brand packs into finer categories (devicon → language/framework/tool/cloud
  rather than one `brands`); add an "area"/region category. *(The app now has an icon-picker drawer
  that groups by pack → category and inserts an `icon "pack/name"` override at the caret; finer
  categories would immediately flow through to it.)*
- Grow the `sketch` pack (more hand-drawn glyphs) and let the cloud/network kind→icon maps switch to
  it when the app is in Sketch mode.
- AWS/Azure/GCP/Oracle/AliCloud official sets + any non-redistributable pack: user-load into the
  git-ignored `vendor/restricted/` via `tools/pack-dir.mjs` + the app's "Load icons" — see
  `vendor/restricted/README.md`. Bundleable packs live in `vendor/open/` (sourced by source-icons.mjs).
- Extend the curated simple-icons / gilbarbara slug lists as needed.
- BPMN: full original AGPL element set authored (events/tasks/gateways/data/artifacts). AliCloud and the
  official AWS/Azure/GCP/Oracle architecture sets remain user-loaded (not redistributable).
- Hand-drawn/xkcd style: under study — a sketchy render mode vs. an authored stick-glyph pack.
- Extend the per-node `icon "<pack>/<name>"` override (now on network/cloud/block) to flowchart/C4 leaves.
- Cache rasterised glyphs in the renderer shell rather than the app.
