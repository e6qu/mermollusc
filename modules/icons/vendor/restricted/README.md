# Restricted icon packs (NOT committed)

Icon sets whose licenses/trademark terms **forbid redistribution** live here — the official
**AWS / Azure / Google Cloud / Oracle Cloud / AliCloud architecture icon sets**, and any other pack
you're not allowed to ship. Everything in this directory except this README is **git-ignored**
(see the repo `.gitignore`), so these assets never enter the repo or its history. You populate it
locally, on your own machine, under the vendor's terms.

## Populate (per pack)

1. **Download** the official icon set from the vendor yourself, accepting their terms:
   - AWS — Architecture Icons (aws.amazon.com/architecture/icons)
   - Azure — Azure Architecture Icons (Microsoft Learn)
   - Google Cloud — GCP architecture icons
   - Oracle Cloud — OCI icon set
   - AliCloud — Alibaba Cloud icon library
   Unzip it so you have a folder of `.svg` files (flatten nested folders if needed).

2. **Convert** the folder to a loadable pack JSON, writing it here:
   ```sh
   node tools/pack-dir.mjs <svg-dir> <packId> "<license note>" \
     modules/icons/vendor/restricted/<packId>.json
   # e.g.
   node tools/pack-dir.mjs ~/Downloads/aws-icons aws "AWS Architecture Icons — local use only" \
     modules/icons/vendor/restricted/aws.json
   ```

3. **Load** it in the app: click **Load icons** and pick `modules/icons/vendor/restricted/<packId>.json`.
   It registers via `decodePack`/`registerPack` (provenance + categories preserved).

4. **Reference** glyphs in a diagram: `icon "<packId>/<name>"` (network/cloud/block leaves).

## Why this is compliant

`tools/pack-dir.mjs` only reads files already on your disk and writes a local JSON; it fetches
nothing. Because this directory is git-ignored, the vendor assets are never redistributed by this
repo. Contrast with `vendor/open/`, which holds only **bundleable** packs (CC0 / MIT / Apache-2.0)
fetched with pinned provenance by `tools/source-icons.mjs`.
