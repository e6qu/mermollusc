#!/usr/bin/env node
// Fetches an AGPL-compatible OSS icon pack at a PINNED commit and writes a provenance-stamped pack
// JSON into modules/icons/vendor/<id>.json (consumed at runtime via @m/icons `decodePack`).
//
// Requires network. Pins MUST be full 40-char commit SHAs verified against the live repo and at
// least 24h old (AGENTS §0.3) — never branch names. Only bundleable licenses (Apache-2.0, MIT,
// CC0) belong here; AWS/Azure/GCP asset packs are NOT redistributable — load those at runtime with
// `decodePack` instead. The PACKS table is intentionally empty: fill it with values discovered and
// verified against the live repos, then run. Do not commit guessed commits, paths, or licenses.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "modules/icons/vendor");

// Shape (kept as a comment so no guessed values are committed):
//   devicon: {
//     repo: "devicons/devicon",
//     ref: "<verified 40-char commit sha>",
//     license: "MIT",
//     icons: { docker: "icons/docker/docker-original.svg", kubernetes: "icons/.../..svg" },
//   }
const PACKS = {};

const SHA = /^[0-9a-f]{40}$/;

const fail = (msg) => {
  console.error(`source-icons: ${msg}`);
  process.exit(1);
};

const raw = (repo, ref, path) => `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;

const fetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) fail(`fetch failed (${res.status}): ${url}`);
  return (await res.text()).trim();
};

const main = async () => {
  const id = process.argv[2];
  if (id === undefined) fail("usage: node tools/source-icons.mjs <packId>");
  const spec = PACKS[id];
  if (spec === undefined) {
    fail(`no spec for "${id}" — add it to PACKS with a verified pinned commit before running`);
  }
  if (!SHA.test(spec.ref)) {
    fail(`pack "${id}" ref must be a full 40-char commit SHA (a pin, not a branch)`);
  }

  const icons = {};
  for (const [name, path] of Object.entries(spec.icons)) {
    icons[name] = await fetchText(raw(spec.repo, spec.ref, path));
  }
  const pack = {
    meta: {
      id,
      license: spec.license,
      source: `https://github.com/${spec.repo}/tree/${spec.ref}`,
      version: spec.ref,
    },
    icons,
  };
  await mkdir(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `${id}.json`);
  await writeFile(out, `${JSON.stringify(pack, null, 2)}\n`);
  console.log(`source-icons: wrote ${out} (${Object.keys(icons).length} icons, ${spec.license})`);
};

await main();
