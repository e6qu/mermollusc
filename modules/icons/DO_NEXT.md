# @m/icons — do next

- Vendor more bundleable packs via `tools/source-icons.mjs`: devicon (MIT), Kubernetes-community
  (Apache-2.0) — verify paths + a ≥24h commit + license per pack, as done for simple-icons.
- Extend the per-node `icon "<pack>/<name>"` override (now on network) to block/flowchart/C4 leaves.
- Cache rasterised glyphs in the renderer shell rather than the app.
