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
- **Bundled OSS pack**: `simpleIconsPack` — 19 cloud-native/devops brand marks (kubernetes, docker,
  googlecloud, postgresql, kafka, cloudflare, …) vendored from simple-icons **CC0-1.0** at a pinned
  commit by `tools/source-icons.mjs` (`vendor/simpleicons.json` + provenance). It's in `defaultRegistry`
  so `findIcon(registry, "simpleicons", <slug>)` resolves. (AWS/Azure marks aren't in simple-icons.)
- tests: 8 passing (registry/resolver, `registerPack`, `decodePack` valid/invalid + register→find,
  vendored-pack provenance + resolution).
- The **cloud** family now renders these marks: its kinds map to simple-icons slugs (compute→docker,
  storage→googlecloudstorage, database→postgresql, queue→apachekafka, cdn→cloudflare).
- Not yet: more OSS packs (devicon MIT, Kubernetes-community Apache-2.0); a general per-node
  `icon "<pack>/<name>"` override so any node can pick any glyph.
