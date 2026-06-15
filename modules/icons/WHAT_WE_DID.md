# @m/icons — work log

- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- core: icon-pack `registry` — `IconPack`/`IconRegistry` types with mandatory provenance
  (id/license/source/version), `findIcon` resolver (fail-loud `Result`), `packNames`.
- core: `builtinPack` "arch" — five original AGPL architecture glyphs (server/database/cloud/
  user/queue) + `defaultRegistry`. 3 unit tests.
- Added four more original AGPL glyphs (router/switch/firewall/host) so the pack covers every
  network node kind 1:1.
- Added three more (compute/storage/cdn) for the cloud service kinds (database/queue reused).
- Wired in-node rendering across the pipeline: `SceneNode.icon` (`IconRef` in contracts), the
  renderer's `icon` draw command + `paint` image map, and the app's resolve-and-rasterise step.
- Added a user-loaded pack path: `decodePack` (shell, `decode()`/Zod — validates `{ meta, icons }`
  into an `IconPack`) + pure `registerPack`. Lets vendor cloud packs (AWS/Azure/GCP) load at runtime
  without redistribution. +4 tests.
- Added `tools/source-icons.mjs`: a provenance-pinned fetcher that writes a bundleable OSS pack to
  `modules/icons/vendor/<id>.json`. Fail-loud — rejects missing specs and non-SHA refs.
- Vendored **simple-icons** (CC0-1.0) with it: verified the license (GitHub API), pinned a commit
  ≥24h old, probed every icon path for HTTP 200, then fetched 19 cloud-native/devops marks →
  `vendor/simpleicons.json` (+ `vendor/README.md` provenance/trademark note). Bundled via
  `src/core/vendored.ts` into `defaultRegistry`. +1 test. (AWS/Azure marks aren't in simple-icons.)
- Vendored **devicon** (MIT) the same way (license + ≥24h pin + path probes via authed `gh api`):
  32 colored brand/tool logos including the **AWS/Azure/GCP/Oracle** marks → `vendor/devicon.json`,
  bundled as `deviconPack`. +1 test.
