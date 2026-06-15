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
