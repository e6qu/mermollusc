import { spawnSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteSource = resolve(repo, "site");
const siteDist = resolve(repo, "site-dist");
const demoDist = resolve(siteDist, "demo");
const playground = resolve(repo, "app/playground");
const pagesBase = process.env.PAGES_BASE ?? "/mermollusc/";

if (!pagesBase.startsWith("/") || !pagesBase.endsWith("/")) {
  throw new Error("PAGES_BASE must start and end with /");
}

await rm(siteDist, { recursive: true, force: true });
await mkdir(siteDist, { recursive: true });
await cp(siteSource, siteDist, { recursive: true });

const vite = spawnSync(
  "pnpm",
  [
    "exec",
    "vite",
    "build",
    `--base=${pagesBase}demo/`,
    "--outDir=../../site-dist/demo",
    "--emptyOutDir=false",
  ],
  {
    cwd: playground,
    env: { ...process.env, VITE_BACKEND_FREE_DEMO: "1" },
    stdio: "inherit",
  },
);

if (vite.error !== undefined) {
  throw vite.error;
}

if (vite.status !== 0) {
  throw new Error(`vite build failed with status ${vite.status}`);
}

console.log(`pages build written to ${siteDist}`);
console.log(`demo build written to ${demoDist}`);
