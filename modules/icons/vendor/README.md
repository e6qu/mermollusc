# Vendored icon packs

Two subdirectories, split by license:

- **`open/`** — bundleable packs (CC0 / MIT / Apache-2.0), committed here, fetched with pinned
  provenance by `tools/source-icons.mjs`. Each pack's JSON carries `meta` (`source` = repo URL @
  commit, `version` = commit SHA, `license`). These load into `defaultRegistry`.
- **`restricted/`** — non-redistributable sets (AWS/Azure/GCP/Oracle/AliCloud official architecture
  icons, …). **git-ignored** — never committed. You populate them locally; see
  `restricted/README.md` for the `tools/pack-dir.mjs` + "Load icons" workflow.

To add an `open/` pack, edit the `PACKS` table in `tools/source-icons.mjs` with values verified
against the live repo (commit ≥24h old, license confirmed, every path probed) and re-run it; it
writes to `open/`.

## open/simpleicons.json

- **Source:** https://github.com/simple-icons/simple-icons @ `0fc52ed37564358d91c764b762fba913090cd26b`
- **License:** CC0-1.0 (the SVG files are public domain).
- **Trademarks:** the brands depicted (Kubernetes, Docker, Google Cloud, etc.) remain the property
  of their respective owners. The CC0 license covers the icon artwork only — use the marks to
  depict the corresponding products, not to imply endorsement.
- **Note:** Amazon (AWS) and Microsoft (Azure) marks were removed from simple-icons at the owners'
  request and are therefore not included.

## open/devicon.json

- **Source:** https://github.com/devicons/devicon @ `7330accdbc47e2dc0c19789a48533c4a3c50fe58`
- **License:** MIT (covers the SVG artwork).
- **Contents:** 61 colored logos — cloud/devops brand marks (AWS/Azure/GCP/Oracle, Docker, k8s, …)
  plus a tech-stack set (languages, frameworks, build tools).
- **Trademarks:** the brands depicted remain their owners' property — depict-only, no endorsement
  implied. The official cloud-provider *architecture* icon sets are **not** redistributable and are
  not bundled; these are the (colored) brand logos.
- **Note:** AliCloud is not in devicon; load it at runtime if needed.

## open/gilbarbara.json

- **Source:** https://github.com/gilbarbara/logos @ `42037415f0df19cd82b3853c18a967a81783f921`
- **License:** CC0-1.0.
- **Contents:** a curated cloud subset (30 of ~1900) — per-service AWS marks (ec2, s3, lambda, rds,
  dynamodb, eks, …), some GCP services, and common tools. Trademarks remain the owners' (depict-only).

## open/k8s.json

- **Source:** https://github.com/kubernetes/community @ `8b03bb61ff9b1e76ec42b413830bd743e892ae3c`
- **License:** Apache-2.0.
- **Contents:** 25 official Kubernetes *resource* shapes (unlabeled) — pod, deploy, svc, ing, cm,
  secret, ns, pv/pvc, sts, ds, rs, job, cronjob, hpa, sa, role/rb, crd, netpol, … + node.

## open/cncf.json (archival, git-LFS)

- **Source:** https://github.com/cncf/landscape @ `abd3a6d7f623774086bdc78624522011660bc57d` (`hosted_logos/`)
- **License:** Apache-2.0 (repo). The 2423 logos are member companies'/projects' **trademarks** —
  depict-only, no endorsement; many are unrelated to diagramming.
- **Storage:** ~64 MB, tracked via **git-LFS** (`.gitattributes`) and exempt from the pre-commit
  hooks (see `.pre-commit-config.yaml`). It is **archival**: referenced by no source code and **not**
  in `defaultRegistry`, so it never loads into the app or tests. To use a logo, read it from this
  file and `registerPack`/`decodePack` it at runtime.
