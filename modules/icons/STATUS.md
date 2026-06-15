# @m/icons — status

**State:** registry + resolver + a built-in glyph pack; `make check` green.

- core: `IconPack` (provenance meta: id/license/source/version + name→SVG map), `IconRegistry`,
  `findIcon(registry, packId, name)` → `Result<svg, IconError>`, `packNames`.
- `builtinPack` ("arch"): 12 original AGPL glyphs — server, database, cloud, user, queue, router,
  switch, firewall, host (network kinds) + compute, storage, cdn (cloud kinds); `defaultRegistry`.
- **In-node rendering is wired**: layout sets a `SceneNode.icon` (`IconRef`); the renderer emits an
  `icon` draw command; the app resolves the ref via `findIcon`, rasterises the SVG, and hands the
  image map to `paint`. Driven today by network node kinds.
- **User-loaded packs**: `decodePack(input)` (shell, via `decode()`) validates an external pack
  payload (`{ meta, icons }`) into an `IconPack`; `registerPack(registry, pack)` (pure) merges it.
  This is the compliant path for vendor cloud packs (AWS/Azure/GCP) — loaded at runtime, never
  bundled.
- **Bundled OSS packs** (vendored with pinned provenance by `tools/source-icons.mjs`, in `defaultRegistry`):
  - `simpleIconsPack` — 19 cloud-native/devops marks from simple-icons **CC0-1.0**.
  - `deviconPack` — 32 colored brand/tool logos from devicon **MIT**, including the **AWS / Azure /
    Google Cloud / Oracle** brand marks (the official *architecture* icon sets stay non-redistributable).
  - resolve via `findIcon(registry, "simpleicons"|"devicon", <name>)`.
- tests: 9 passing (registry/resolver, `registerPack`, `decodePack` valid/invalid + register→find,
  simple-icons + devicon vendored-pack provenance + resolution).
- The **cloud** family renders these marks (kind→slug map); the **network** family accepts a
  per-node `icon "<pack>/<name>"` override that resolves against any registered pack.
- Not yet: more OSS packs (devicon MIT, Kubernetes-community Apache-2.0); the per-node override on
  the remaining families (block/flowchart/C4).
