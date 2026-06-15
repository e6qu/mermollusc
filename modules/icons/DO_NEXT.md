# @m/icons — do next

- Vendor Kubernetes-community resource icons (Apache-2.0) + gilbarbara/logos (CC0) via
  `tools/source-icons.mjs`, same verified pipeline (simple-icons CC0 + devicon MIT already bundled).
- BPMN: author original AGPL glyphs (bpmn-io/bpmn-font has no license — can't vendor). AliCloud and
  the official AWS/Azure/GCP/Oracle architecture sets are user-loaded (not redistributable).
- Extend the per-node `icon "<pack>/<name>"` override (now on network) to block/flowchart/C4 leaves.
- Cache rasterised glyphs in the renderer shell rather than the app.
