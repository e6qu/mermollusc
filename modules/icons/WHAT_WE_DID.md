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
- Vendored **gilbarbara/logos** (CC0): a curated 30-icon cloud subset — per-*service* AWS marks
  (ec2/s3/lambda/rds/…) + GCP + tools → `vendor/gilbarbara.json`, bundled as `gilbarbaraPack`. +1 test.
- Vendored **Kubernetes-community** resource icons (Apache-2.0): 25 official unlabeled shapes
  (pod/deploy/svc/…/node) → `vendor/k8s.json`, bundled as `k8sPack`. +1 test. Extended simple-icons
  from 19→36 slugs (envoy, argo, vault, consul, jaeger, opentelemetry, vmware, datadog, …).
- Archived the **full CNCF landscape** (2423 logos, ~64 MB, Apache-2.0) at a pinned commit to
  `vendor/cncf.json` via **git-LFS** (`.gitattributes` + a pre-commit `exclude`). Deliberately *not*
  imported/registered — it'd bloat the bundle and risk the e2e gate; it's an archival asset.
