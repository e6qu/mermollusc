# @m/icons — status

**State:** registry + resolver + a built-in glyph pack; `make check` green.

- core: `IconPack` (provenance meta + name→SVG map + **`categories`** name-groups), `IconRegistry`,
  `findIcon(registry, packId, name)` → `Result<svg, IconError>`, `packNames`, `categoryNames`,
  `iconsInCategory`, `singleCategory`.
- **Categories**: every pack groups its icons (authored packs: arch → compute/data/network/messaging/
  people, bpmn → event/activity/gateway/data; vendored brand packs → `brands`; k8s → `resources`;
  user packs default to `all` or honour a `categories` field).
- `builtinPack` ("arch"): 21 original AGPL glyphs — the family node kinds (server, database, cloud,
  user, queue, router, switch, firewall, host, compute, storage, cdn) + a richer infra palette
  (load-balancer, gateway, container, microservice, cache, bucket, key, lock), grouped compute/data/
  network/messaging/security/people; `defaultRegistry`.
- `bpmnPack` ("bpmn"): 41 original AGPL BPMN-2.0 glyphs — the full element matrix: typed start/
  intermediate/end events (message/timer/signal/error/escalation/conditional/link/terminate) composed
  from a ring + trigger symbol; all task types (user/service/script/manual/send/receive/business-rule)
  + subprocess/call-activity/transaction; exclusive/parallel/inclusive/complex/event gateways; data
  object/store/input/output/collection; group/annotation/pool/lane artifacts. Categorised event/
  activity/gateway/data/artifact.
- `sketchPack` ("sketch"): 6 original AGPL hand-drawn/xkcd-style outline glyphs (person/server/
  database/cloud/note/box) to pair with the renderer's Sketch mode.
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
- **Archival (git-LFS, not in `defaultRegistry`)**: `vendor/open/cncf.json` — the full CNCF landscape
  (2423 logos, ~64 MB, Apache-2.0) tracked via git-LFS; referenced by no code, load at runtime if
  wanted. Kept out of the bundle so it can't affect app/test performance.
- tests: 16 passing (registry/resolver, `registerPack`, categories incl. `brands`, `decodePack`
  valid/invalid + default/explicit categories incl. the script/handler/foreignObject reject, BPMN +
  sketch packs, vendored-pack provenance).
- The **cloud** family renders these marks (kind→slug map); the **network**, **cloud**, and **block**
  families each accept a per-node `icon "<pack>/<name>"` override (`icon: IconRef | null` on their AST
  nodes) that resolves against any registered pack.
- Not yet: the per-node override on the remaining families (flowchart/C4 — deferred, their grammars
  make a node-level icon slot awkward).
