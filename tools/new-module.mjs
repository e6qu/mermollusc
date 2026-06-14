#!/usr/bin/env node
// Module scaffolder. Creates the uniform self-contained layout for a module:
// five doc files, Makefile, package.json, tsconfig.json, and src/{index,core/index,shell/index}.
// Idempotent: never overwrites an existing file (so populated cores survive re-runs).
//
// Usage: node tools/new-module.mjs <name> "<description>" "dep1,dep2,..."
//   deps prefixed with @m/ become workspace deps; others resolve from the catalog.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const [name, description = "", depsCsv = ""] = process.argv.slice(2);
if (!name) {
  console.error('usage: new-module.mjs <name> "<description>" "dep1,dep2"');
  process.exit(1);
}

const isApp = name === "playground";
const dir = isApp ? join("app", name) : join("modules", name);
const pkg = `@m/${name}`;
const deps = depsCsv.split(",").map((d) => d.trim()).filter(Boolean);

/** @param {string[]} list */
const depBlock = (list) =>
  list
    .map((d) => `    ${JSON.stringify(d)}: ${JSON.stringify(d.startsWith("@m/") ? "workspace:*" : "catalog:")}`)
    .join(",\n");

/** @param {string} rel @param {string} body */
function write(rel, body) {
  const p = join(dir, rel);
  if (existsSync(p)) return;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  console.log("  +", p);
}

const files = {
  "PLAN.md": `# ${pkg} — plan\n\n${description}\n\n## Responsibility\n\nTODO — what this module owns and what it explicitly does not.\n\n## Public API (stable surface)\n\nTODO.\n`,
  "STATUS.md": `# ${pkg} — status\n\n**State:** scaffolded (no logic yet).\n\n- build: stub\n- tests: none\n`,
  "WHAT_WE_DID.md": `# ${pkg} — work log\n\n- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.\n`,
  "DO_NEXT.md": `# ${pkg} — do next\n\n- Define core types and pure functions in \`src/core\`.\n- Add unit (property-based) tests in \`test/unit\`.\n`,
  "BUGS.md": `# ${pkg} — bugs\n\n_None known._\n`,
  "Makefile": `MODULE := ${name}\ninclude ../../module.mk\n`,
  "package.json": `{
  "name": ${JSON.stringify(pkg)},
  "version": "0.0.0",
  "license": "AGPL-3.0-or-later",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": { "types": "./src/index.ts", "import": "./src/index.ts" }
  }${
    deps.length
      ? `,\n  "dependencies": {\n${depBlock(deps)}\n  }`
      : ""
  }
}
`,
  "tsconfig.json": `{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
`,
  "src/index.ts": "export {};\n",
  "src/core/index.ts": "export {};\n",
  "src/shell/index.ts": "export {};\n",
};

console.log(`scaffolding ${pkg} at ${dir}`);
for (const [rel, body] of Object.entries(files)) write(rel, body);
