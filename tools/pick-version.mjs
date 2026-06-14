#!/usr/bin/env node
// Supply-chain version policy: only use a STABLE release published at least MIN_AGE_HOURS ago.
// A freshly published version can be a hijacked release; we wait out a quarantine window.
//
//   node tools/pick-version.mjs <pkg> [<pkg> ...]   -> print the version to pin for each
//   node tools/pick-version.mjs --verify-catalog    -> audit pnpm-workspace.yaml catalog pins
//
// env MIN_AGE_HOURS (default 24).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MIN_AGE_HOURS = Number(process.env.MIN_AGE_HOURS ?? "24");
const cutoff = Date.now() - MIN_AGE_HOURS * 3600_000;
const STABLE = /^\d+\.\d+\.\d+$/;

/** @param {string} a @param {string} b */
function cmpSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** @param {string} pkg */
function inspect(pkg) {
  const raw = execFileSync("npm", ["view", pkg, "time", "--json"], { encoding: "utf8" });
  /** @type {Record<string, string>} */
  const times = JSON.parse(raw);
  const stable = Object.keys(times)
    .filter((v) => STABLE.test(v))
    .sort(cmpSemver);
  const eligible = stable.filter((v) => new Date(times[v]).getTime() <= cutoff);
  return {
    latestStable: stable.at(-1) ?? null,
    eligible: eligible.at(-1) ?? null,
    times,
  };
}

/** @param {string} file */
function readCatalog(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => l.trimEnd() === "catalog:");
  /** @type {Array<[string, string]>} */
  const out = [];
  if (start === -1) return out;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // dedent → end of catalog block
    const m = line.match(/^\s+"?([^":\s]+)"?:\s*(\S+)\s*$/);
    if (m !== null) out.push([m[1], m[2]]);
  }
  return out;
}

if (process.argv[2] === "--verify-catalog") {
  let bad = false;
  for (const [pkg, pinned] of readCatalog("pnpm-workspace.yaml")) {
    const { eligible, times } = inspect(pkg);
    const pinnedTime = times[pinned];
    if (pinnedTime === undefined) {
      console.error(`✗ ${pkg}@${pinned}: not a published version`);
      bad = true;
    } else if (new Date(pinnedTime).getTime() > cutoff) {
      console.error(`✗ ${pkg}@${pinned}: published <${MIN_AGE_HOURS}h ago (${pinnedTime})`);
      bad = true;
    } else if (eligible !== null && cmpSemver(eligible, pinned) > 0) {
      console.log(`• ${pkg}@${pinned}: behind eligible ${eligible} (consider bumping)`);
    } else {
      console.log(`✓ ${pkg}@${pinned}`);
    }
  }
  process.exit(bad ? 1 : 0);
}

let failed = false;
for (const pkg of process.argv.slice(2)) {
  const { eligible, latestStable, times } = inspect(pkg);
  if (eligible === null) {
    console.error(`${pkg}: no stable version older than ${MIN_AGE_HOURS}h`);
    failed = true;
    continue;
  }
  const held = eligible !== latestStable ? `  (holding back from ${latestStable}: too fresh)` : "";
  console.log(`${pkg}\t${eligible}\t${times[eligible]}${held}`);
}
if (failed) process.exit(1);
