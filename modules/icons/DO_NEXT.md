# @m/icons — do next

- Vendor real OSS packs via a sourcing script with pinned provenance: Kubernetes (Apache-2.0),
  CNCF, simple-icons (CC0), devicon (MIT). Verify each license is AGPL-compatible before bundling.
- Loader for user-supplied vendor cloud packs (AWS/Azure/GCP) — never redistributed.
- Render icons inside nodes: a Scene icon reference + renderer drawing the SVG (or HTML-in-Canvas).
- A `shell` loader to read packs from disk/URL through `decode()`.
