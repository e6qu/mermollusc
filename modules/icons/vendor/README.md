# Vendored icon packs

Third-party icon packs fetched by `tools/source-icons.mjs` at a pinned commit. Each pack's JSON
carries its provenance in `meta` (`source` = repo URL @ commit, `version` = commit SHA, `license`).
Only AGPL-compatible licenses are bundled here; vendor packs whose terms forbid redistribution
(e.g. AWS / Azure / GCP official asset sets) are **not** committed — load those at runtime via
`decodePack` instead.

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
- **Trademarks:** the brands depicted (AWS, Azure, Google Cloud, Oracle, Docker, …) remain their
  owners' property — depict-only, no endorsement implied. The official cloud-provider *architecture*
  icon sets are **not** redistributable and are not bundled; these are the (colored) brand logos.
- **Note:** AliCloud is not in devicon; load it at runtime if needed.

## gilbarbara.json

- **Source:** https://github.com/gilbarbara/logos @ `42037415f0df19cd82b3853c18a967a81783f921`
- **License:** CC0-1.0.
- **Contents:** a curated cloud subset (30 of ~1900) — per-service AWS marks (ec2, s3, lambda, rds,
  dynamodb, eks, …), some GCP services, and common tools. Trademarks remain the owners' (depict-only).

To refresh or add a pack, edit the `PACKS` table in `tools/source-icons.mjs` with values verified
against the live repo (commit ≥24h old, license confirmed, every path probed) and re-run it.
