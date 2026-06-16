# @m/icons — status

**State:** registry + resolver + a built-in glyph pack; `make check` green.

- core: `IconPack` (provenance meta + name→SVG map + **`categories`** name-groups), `IconRegistry`,
  `findIcon(registry, packId, name)` → `Result<svg, IconError>`, `packNames`, `categoryNames`,
  `iconsInCategory`, `singleCategory`.
- **Categories**: every pack groups its icons (authored packs: arch → compute/data/network/messaging/
  people, bpmn → event/activity/gateway/data; vendored brand packs → `brands`; k8s → `resources`;
  user packs default to `all` or honour a `categories` field).
- `builtinPack` ("arch"): 12 original AGPL glyphs — server, database, cloud, user, queue, router,
  switch, firewall, host (network kinds) + compute, storage, cdn (cloud kinds); `defaultRegistry`.
- `bpmnPack` ("bpmn"): 12 original AGPL BPMN-notation glyphs — start/end/intermediate/message/timer
  events, task, subprocess, exclusive/parallel/inclusive gateways, data-object, data-store.
- **In-node rendering is wired**: layout sets a `SceneNode.icon` (`IconRef`); the renderer emits an
  `icon` draw command; the app resolves the ref via `findIcon`, rasterises the SVG, and hands the
  image map to `paint`. Driven today by network node kinds.
- **User-loaded packs**: `decodePack(input)` (shell, via `decode()`) validates an external pack
  payload (`{ meta, icons }`) into an `IconPack`; `registerPack(registry, pack)` (pure) merges it.
  This is the compliant path for vendor cloud packs (AWS/Azure/GCP) — loaded at runtime, never
  bundled.
- **Bundled OSS packs** (vendored with pinned provenance by `tools/source-icons.mjs`, in `defaultRegistry`):
  - `simpleIconsPack` — 36 cloud-native/devops marks from simple-icons **CC0-1.0**.
  - `deviconPack` — 61 colored logos from devicon **MIT**: cloud/devops brand marks (**AWS / Azure /
    Google Cloud / Oracle**, …) + a tech-stack set (languages, frameworks, build tools). Official
    *architecture* icon sets stay non-redistributable.
  - `gilbarbaraPack` — 30 per-*service* cloud icons from gilbarbara/logos **CC0** (AWS ec2/s3/lambda/
    rds/dynamodb/eks/…, some GCP, common tools).
  - `k8sPack` — 25 official Kubernetes *resource* shapes from kubernetes/community **Apache-2.0**
    (pod, deploy, svc, ing, cm, secret, sts, ds, rs, job, cronjob, hpa, crd, netpol, … + node).
  - resolve via `findIcon(registry, "simpleicons"|"devicon"|"gilbarbara"|"k8s", <name>)`.
- **Archival (git-LFS, not in `defaultRegistry`)**: `vendor/cncf.json` — the full CNCF landscape
  (2423 logos, ~64 MB, Apache-2.0) tracked via git-LFS; referenced by no code, load at runtime if
  wanted. Kept out of the bundle so it can't affect app/test performance.
- tests: 14 passing (registry/resolver, `registerPack`, categories incl. `brands`, `decodePack`
  valid/invalid + default/explicit categories + register→find, BPMN pack, vendored-pack provenance).
- The **cloud** family renders these marks (kind→slug map); the **network** family accepts a
  per-node `icon "<pack>/<name>"` override that resolves against any registered pack.
- Not yet: more OSS packs (devicon MIT, Kubernetes-community Apache-2.0); the per-node override on
  the remaining families (block/flowchart/C4).
