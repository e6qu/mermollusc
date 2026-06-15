# @m/icons — work log

- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- core: icon-pack `registry` — `IconPack`/`IconRegistry` types with mandatory provenance
  (id/license/source/version), `findIcon` resolver (fail-loud `Result`), `packNames`.
- core: `builtinPack` "arch" — five original AGPL architecture glyphs (server/database/cloud/
  user/queue) + `defaultRegistry`. 3 unit tests.
- Added four more original AGPL glyphs (router/switch/firewall/host) so the pack covers every
  network node kind 1:1.
- Wired in-node rendering across the pipeline: `SceneNode.icon` (`IconRef` in contracts), the
  renderer's `icon` draw command + `paint` image map, and the app's resolve-and-rasterise step.
- Added a user-loaded pack path: `decodePack` (shell, `decode()`/Zod — validates `{ meta, icons }`
  into an `IconPack`) + pure `registerPack`. Lets vendor cloud packs (AWS/Azure/GCP) load at runtime
  without redistribution. +4 tests.
- Added `tools/source-icons.mjs`: a provenance-pinned fetcher that writes a bundleable OSS pack to
  `modules/icons/vendor/<id>.json`. Fail-loud — rejects missing specs and non-SHA refs; needs
  network + verified pins to run (not yet executed). Verified its offline guards.
