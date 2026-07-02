import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteSource = resolve(repo, "site");
const siteDist = resolve(repo, "site-dist");
const demoDist = resolve(siteDist, "demo");
const playground = resolve(repo, "app/playground");
const relayModule = resolve(repo, "modules/relay");
const pagesBase = process.env.PAGES_BASE ?? "/mermollusc/";

if (!pagesBase.startsWith("/") || !pagesBase.endsWith("/")) {
  throw new Error("PAGES_BASE must start and end with /");
}

await rm(siteDist, { recursive: true, force: true });
await mkdir(siteDist, { recursive: true });
await cp(siteSource, siteDist, { recursive: true });

// The backend-free demo runs the SAME relay production runs, compiled to WebAssembly (see
// modules/relay/cmd/relay-wasm and modules/collab/src/shell/wasm-relay.ts) — not a separate
// reimplementation. Vite ships anything placed in app/playground/public/ verbatim, so the built
// artifacts are staged there just for this build and removed again afterward: this is a demo-build-only
// concern, not something every normal dev/prod build of the app should carry.
const goEnv = spawnSync("go", ["env", "GOROOT"], { encoding: "utf8" });
if (goEnv.status !== 0) {
  throw new Error(`go env GOROOT failed: ${goEnv.stderr}`);
}
const goroot = goEnv.stdout.trim();
const publicDir = resolve(playground, "public");
const relayWasmDest = join(publicDir, "relay.wasm");
const wasmExecDest = join(publicDir, "wasm_exec.js");
const publicDirPreexisted = existsSync(publicDir);
await mkdir(publicDir, { recursive: true });

const goBuild = spawnSync(
  "go",
  ["build", "-o", relayWasmDest, "./cmd/relay-wasm"],
  { cwd: relayModule, env: { ...process.env, GOOS: "js", GOARCH: "wasm" }, stdio: "inherit" },
);
if (goBuild.error !== undefined) throw goBuild.error;
if (goBuild.status !== 0) throw new Error(`go build (GOOS=js GOARCH=wasm) failed with status ${goBuild.status}`);

await cp(join(goroot, "lib/wasm/wasm_exec.js"), wasmExecDest);

try {
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
} finally {
  await rm(relayWasmDest, { force: true });
  await rm(wasmExecDest, { force: true });
  if (!publicDirPreexisted) await rm(publicDir, { recursive: true, force: true });
}

// Browsers require an explicit CSP allowance to compile WebAssembly at all — script-src 'self' alone
// blocks it (confirmed: WebAssembly.instantiate() throws a CSP violation without this). 'wasm-unsafe-eval'
// (CSP Level 3) permits *only* WASM compilation, never eval()/Function() string execution — unlike the
// much broader 'unsafe-eval'. Patched into the demo's OWN built index.html only, not
// app/playground/index.html: every other build/deployment of this app keeps the stricter policy
// unchanged, since only the backend-free demo runs a relay in-process.
const demoIndexPath = join(demoDist, "index.html");
const demoIndexHtml = await readFile(demoIndexPath, "utf8");
const patchedDemoIndexHtml = demoIndexHtml.replace(
  /script-src 'self';/,
  "script-src 'self' 'wasm-unsafe-eval';",
);
if (patchedDemoIndexHtml === demoIndexHtml) {
  throw new Error(
    `${demoIndexPath}: expected CSP script-src directive not found — refusing to ship the demo without the WASM allowance it needs`,
  );
}
await writeFile(demoIndexPath, patchedDemoIndexHtml);

console.log(`pages build written to ${siteDist}`);
console.log(`demo build written to ${demoDist}`);
