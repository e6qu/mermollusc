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

To refresh or add a pack, edit the `PACKS` table in `tools/source-icons.mjs` with values verified
against the live repo (commit ≥24h old, license confirmed, every path probed) and re-run it.
