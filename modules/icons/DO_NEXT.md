# @m/icons — do next

- Vendor real OSS packs via a sourcing script with pinned provenance: Kubernetes (Apache-2.0),
  CNCF, simple-icons (CC0), devicon (MIT). Verify each license is AGPL-compatible before bundling.
- Loader for user-supplied vendor cloud packs (AWS/Azure/GCP) — never redistributed.
- A `shell` loader to read packs from disk/URL through `decode()`.
- Let other families reference icons too (flowchart/block node → icon), and cache rasterised
  glyphs in the renderer shell rather than the app.
