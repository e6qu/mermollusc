# @m/icons — do next

- Vendor Kubernetes-community resource icons (Apache-2.0) + the CNCF landscape (Apache-2.0 repo;
  bundle wholesale per the owner's call, with the trademark NOTICE) via `tools/source-icons.mjs`.
- Extend the curated simple-icons / gilbarbara slug lists as needed.
- BPMN: author original AGPL glyphs (bpmn-io/bpmn-font has no license — can't vendor). AliCloud and
  the official AWS/Azure/GCP/Oracle architecture sets are user-loaded (not redistributable).
- Hand-drawn/xkcd style: under study — a sketchy render mode vs. an authored stick-glyph pack.
- Extend the per-node `icon "<pack>/<name>"` override (now on network) to block/flowchart/C4 leaves.
- Cache rasterised glyphs in the renderer shell rather than the app.
