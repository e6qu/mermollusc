# @m/icons — do next

- Vendor more bundleable packs via `tools/source-icons.mjs`: devicon (MIT), Kubernetes-community
  (Apache-2.0) — verify paths + a ≥24h commit + license per pack, as done for simple-icons.
- Diagram-level icon references so vendored glyphs actually render: e.g. an explicit
  `icon "<pack>/<name>"` on a node, or a kind→vendored-slug map for a family.
- Let other families reference icons too (flowchart/block node → icon), and cache rasterised
  glyphs in the renderer shell rather than the app.
