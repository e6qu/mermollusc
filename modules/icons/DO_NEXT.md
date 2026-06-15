# @m/icons — do next

- Run `tools/source-icons.mjs` (needs network) to vendor bundleable OSS packs — Kubernetes
  (Apache-2.0), simple-icons (CC0), devicon (MIT): discover + verify exact icon paths and a ≥24h-old
  commit SHA per pack, confirm each license, then commit `modules/icons/vendor/<id>.json`.
- App affordance: load a user pack from a file/URL (`fetch` → `decodePack` → `registerPack`) so the
  vendor cloud packs (AWS/Azure/GCP) work end-to-end without redistribution.
- Let other families reference icons too (flowchart/block node → icon), and cache rasterised
  glyphs in the renderer shell rather than the app.
