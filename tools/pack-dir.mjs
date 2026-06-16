#!/usr/bin/env node
// Convert a local directory of `.svg` files into a mermollusc icon-pack JSON, loadable via the app's
// "Load icons" button (it runs through `@m/icons` `decodePack`). This is the compliant way to use
// icon sets we may not redistribute — the official AWS / Azure / Google Cloud / Oracle / AliCloud
// architecture sets, etc.: download them from the vendor yourself, run this against the folder, and
// load the result locally. Nothing is fetched or bundled; the SVGs never enter this repo.
//
// usage: node tools/pack-dir.mjs <dir> <packId> <license> [out.json]
//   e.g. node tools/pack-dir.mjs ~/Downloads/aws-icons aws "AWS asset terms (local use)" aws.pack.json

import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const [dir, id, license, out] = process.argv.slice(2);

const fail = (msg) => {
  console.error(`pack-dir: ${msg}`);
  process.exit(1);
};

if (dir === undefined || id === undefined || license === undefined) {
  fail("usage: node tools/pack-dir.mjs <dir> <packId> <license> [out.json]");
}

const entries = await readdir(dir).catch(() => fail(`cannot read directory: ${dir}`));
const svgs = entries.filter((f) => f.toLowerCase().endsWith(".svg"));
if (svgs.length === 0) fail(`no .svg files in ${dir}`);

const icons = {};
for (const file of svgs) {
  icons[basename(file, ".svg")] = (await readFile(join(dir, file), "utf8")).trim();
}

const pack = { meta: { id, license, source: dir, version: "local" }, icons };
const outPath = out ?? `${id}.pack.json`;
await writeFile(outPath, `${JSON.stringify(pack, null, 2)}\n`);
console.log(`pack-dir: wrote ${outPath} (${svgs.length} icons, ${license})`);
