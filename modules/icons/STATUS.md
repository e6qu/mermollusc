# @m/icons — status

**State:** registry + resolver + a built-in glyph pack; `make check` green.

- core: `IconPack` (provenance meta: id/license/source/version + name→SVG map), `IconRegistry`,
  `findIcon(registry, packId, name)` → `Result<svg, IconError>`, `packNames`.
- `builtinPack` ("arch"): original AGPL glyphs — server, database, cloud, user, queue, router,
  switch, firewall, host (names match the network node kinds 1:1); `defaultRegistry`.
- **In-node rendering is wired**: layout sets a `SceneNode.icon` (`IconRef`); the renderer emits an
  `icon` draw command; the app resolves the ref via `findIcon`, rasterises the SVG, and hands the
  image map to `paint`. Driven today by network node kinds.
- **User-loaded packs**: `decodePack(input)` (shell, via `decode()`) validates an external pack
  payload (`{ meta, icons }`) into an `IconPack`; `registerPack(registry, pack)` (pure) merges it.
  This is the compliant path for vendor cloud packs (AWS/Azure/GCP) — loaded at runtime, never
  bundled. `tools/source-icons.mjs` is the provenance-pinned fetcher for *bundleable* OSS packs
  (Apache-2.0/MIT/CC0); it refuses to run without verified 40-char commit pins (network required).
- tests: 7 passing (registry/resolver, `registerPack`, `decodePack` valid/invalid + register→find).
- Not yet: vendored OSS packs committed (run the sourcing script with network + verified pins);
  app affordance to load a user pack from a file/URL.
