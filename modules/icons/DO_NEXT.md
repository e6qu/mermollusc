# @m/icons — do next

- Define the icon-pack registry contract: `{ id, sourceUrl, license, pinnedCommit, icons }`.
- Bundle only AGPL-compatible OSS packs (Kubernetes Apache-2.0, CNCF, simple-icons CC0,
  devicon MIT) with per-pack provenance; never redistribute vendor cloud packs (AWS/Azure/GCP).
- Implement a loader so users point at official cloud packs they download themselves.
- Add unit (property-based) tests in `test/unit`.
