# Vendored icon packs

Third-party icon packs fetched by `tools/source-icons.mjs` at a pinned commit. Each pack's JSON
carries its provenance in `meta` (`source` = repo URL @ commit, `version` = commit SHA, `license`).
Only AGPL-compatible licenses are bundled here; vendor packs whose terms forbid redistribution
(e.g. AWS / Azure / GCP / Oracle / AliCloud official asset sets) are **not** committed — load those
at runtime via `decodePack` instead.

## Using icon sets we can't bundle (AWS / Azure / GCP / Oracle / AliCloud official, …)

Their terms forbid redistribution, so they're never committed here. To use them locally:

1. Download the official SVG set from the vendor (accepting their terms).
2. Convert the folder to a loadable pack: `node tools/pack-dir.mjs <dir> <packId> "<license>" out.json`.
3. In the app, click **Load icons** and pick `out.json` — it registers via `decodePack`/`registerPack`.
4. Reference glyphs in a diagram with `icon "<packId>/<name>"` (network/cloud/block).

Nothing is fetched or bundled by this flow; the assets stay on your machine.

## simpleicons.json

- **Source:** https://github.com/simple-icons/simple-icons @ `0fc52ed37564358d91c764b762fba913090cd26b`
- **License:** CC0-1.0 (the SVG files are public domain).
- **Trademarks:** the brands depicted (Kubernetes, Docker, Google Cloud, etc.) remain the property
  of their respective owners. The CC0 license covers the icon artwork only — use the marks to
  depict the corresponding products, not to imply endorsement.
- **Note:** Amazon (AWS) and Microsoft (Azure) marks were removed from simple-icons at the owners'
  request and are therefore not included.

## devicon.json

- **Source:** https://github.com/devicons/devicon @ `7330accdbc47e2dc0c19789a48533c4a3c50fe58`
- **License:** MIT (covers the SVG artwork).
- **Contents:** 61 colored logos — cloud/devops brand marks (AWS/Azure/GCP/Oracle, Docker, k8s, …)
  plus a tech-stack set (languages, frameworks, build tools).
- **Trademarks:** the brands depicted remain their owners' property — depict-only, no endorsement
  implied. The official cloud-provider *architecture* icon sets are **not** redistributable and are
  not bundled; these are the (colored) brand logos.
- **Note:** AliCloud is not in devicon; load it at runtime if needed.

## gilbarbara.json

- **Source:** https://github.com/gilbarbara/logos @ `42037415f0df19cd82b3853c18a967a81783f921`
- **License:** CC0-1.0.
- **Contents:** a curated cloud subset (30 of ~1900) — per-service AWS marks (ec2, s3, lambda, rds,
  dynamodb, eks, …), some GCP services, and common tools. Trademarks remain the owners' (depict-only).

## k8s.json

- **Source:** https://github.com/kubernetes/community @ `8b03bb61ff9b1e76ec42b413830bd743e892ae3c`
- **License:** Apache-2.0.
- **Contents:** 25 official Kubernetes *resource* shapes (unlabeled) — pod, deploy, svc, ing, cm,
  secret, ns, pv/pvc, sts, ds, rs, job, cronjob, hpa, sa, role/rb, crd, netpol, … + node.

## cncf.json (archival, git-LFS)

- **Source:** https://github.com/cncf/landscape @ `abd3a6d7f623774086bdc78624522011660bc57d` (`hosted_logos/`)
- **License:** Apache-2.0 (repo). The 2423 logos are member companies'/projects' **trademarks** —
  depict-only, no endorsement; many are unrelated to diagramming.
- **Storage:** ~64 MB, tracked via **git-LFS** (`.gitattributes`) and exempt from the pre-commit
  hooks (see `.pre-commit-config.yaml`). It is **archival**: referenced by no source code and **not**
  in `defaultRegistry`, so it never loads into the app or tests. To use a logo, read it from this
  file and `registerPack`/`decodePack` it at runtime.

To refresh or add a pack, edit the `PACKS` table in `tools/source-icons.mjs` with values verified
against the live repo (commit ≥24h old, license confirmed, every path probed) and re-run it.
