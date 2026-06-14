#!/usr/bin/env node
// Type-policy guard (AGENTS.md §0, §3). Two AST-accurate passes (TypeScript compiler API,
// not regex — so matches inside strings/comments do not false-positive):
//
//   1. In the core dir (default src/core): ban the `any` type, the `unknown` type, and
//      `as` / angle-bracket type assertions — EXCEPT `as const` (a safe narrowing).
//   2. Across the whole src tree: ban wildcard imports/exports (`import * as`, `export *`).
//
// Fails loudly with a non-zero exit.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";

const coreDir = process.argv[2] ?? "src/core";
const srcDir = dirname(coreDir);

/** @param {string} dir @returns {string[]} */
function tsFiles(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // directory absent — nothing to check
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** @param {ts.AsExpression} node */
function isAsConst(node) {
  const t = node.type;
  return ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && t.typeName.text === "const";
}

const violations = [];

/** @param {string} file @param {(node: ts.Node, sf: ts.SourceFile) => string | null} classify */
function scan(file, classify) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  /** @param {ts.Node} node */
  const visit = (node) => {
    const bad = classify(node, sf);
    if (bad !== null) {
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      violations.push(`${file}:${line + 1}:${character + 1}  ${bad}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Pass 2 (whole src): wildcard imports/exports.
for (const file of tsFiles(srcDir)) {
  scan(file, (node) => {
    if (ts.isImportDeclaration(node)) {
      const nb = node.importClause?.namedBindings;
      if (nb !== undefined && ts.isNamespaceImport(nb)) return "wildcard `import * as`";
    }
    if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause;
      if (node.moduleSpecifier !== undefined && clause === undefined) return "wildcard `export *`";
      if (clause !== undefined && ts.isNamespaceExport(clause)) return "wildcard `export * as`";
    }
    return null;
  });
}

// Pass 1 (core only): unsafe types/casts.
for (const file of tsFiles(coreDir)) {
  scan(file, (node) => {
    if (ts.isAsExpression(node) && !isAsConst(node)) return "`as` type assertion";
    if (ts.isTypeAssertionExpression(node)) return "angle-bracket type assertion";
    if (node.kind === ts.SyntaxKind.UnknownKeyword) return "`unknown` type";
    if (node.kind === ts.SyntaxKind.AnyKeyword) return "`any` type";
    return null;
  });
}

if (violations.length > 0) {
  console.error(`type-guard: ${violations.length} violation(s)`);
  for (const v of violations) console.error("  " + v);
  console.error("Fix: name imports/exports explicitly; move unsafe ops to src/shell via brand()/decode(). See AGENTS.md.");
  process.exit(1);
}

console.log(`type-guard: clean (${srcDir} wildcards, ${coreDir} types)`);
