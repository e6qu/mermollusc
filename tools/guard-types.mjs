#!/usr/bin/env node
// Type-policy guard (AGENTS.md §0, §3). AST-accurate (TypeScript compiler API, not regex — so
// matches inside strings do not false-positive), plus a line scan for suppression directives.
//
//   core only (default src/core): bans `any`, `unknown`, `as`/angle-bracket assertions
//     (except `as const`), authored `undefined` types, optional `?:` members/params,
//     `Record<string|number, …>` and index-signature dicts.
//   whole src: bans wildcard imports/exports and type/lint suppressions
//     (`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `biome-ignore`).
//
// Fails loudly with a non-zero exit.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";

const coreDir = process.argv[2] ?? "src/core";
const srcDir = dirname(coreDir);
const SUPPRESS = /@ts-(ignore|expect-error|nocheck)\b|biome-ignore/;

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

/** @param {ts.Node} node */
function isStringOrNumberRecord(node) {
  if (!ts.isTypeReferenceNode(node)) return false;
  if (!ts.isIdentifier(node.typeName) || node.typeName.text !== "Record") return false;
  const first = node.typeArguments?.[0];
  return (
    first !== undefined &&
    (first.kind === ts.SyntaxKind.StringKeyword || first.kind === ts.SyntaxKind.NumberKeyword)
  );
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

// Whole src: wildcard imports/exports.
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
    // Inline `import("…")` type expressions are banned — use a named top-level import instead.
    if (ts.isImportTypeNode(node)) return "inline `import(...)` type (use a top-level import)";
    return null;
  });
}

// Whole src: imports must sit at the top of the file. Mid-file imports are banned even to break a
// circular dependency — rearrange the files instead.
for (const file of tsFiles(srcDir)) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  let seenNonImport = false;
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) || ts.isImportEqualsDeclaration(stmt)) {
      if (seenNonImport) {
        const { line, character } = sf.getLineAndCharacterOfPosition(stmt.getStart(sf));
        violations.push(`${file}:${line + 1}:${character + 1}  mid-file import (move to the top; rearrange files instead of inlining)`);
      }
    } else {
      seenNonImport = true;
    }
  }
}

// Whole src: no type/lint suppression directives.
for (const file of tsFiles(srcDir)) {
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (SUPPRESS.test(lines[i])) violations.push(`${file}:${i + 1}:1  type/lint suppression directive`);
  }
}

// Core only: unsafe types, authored undefined/optional, and string-keyed dicts.
for (const file of tsFiles(coreDir)) {
  scan(file, (node) => {
    if (ts.isAsExpression(node) && !isAsConst(node)) return "`as` type assertion";
    if (ts.isTypeAssertionExpression(node)) return "angle-bracket type assertion";
    if (node.kind === ts.SyntaxKind.UnknownKeyword) return "`unknown` type";
    if (node.kind === ts.SyntaxKind.AnyKeyword) return "`any` type";
    if (node.kind === ts.SyntaxKind.UndefinedKeyword) return "`undefined` type (use null / required / default)";
    if (ts.isIndexSignatureDeclaration(node)) return "index signature (use closed-union keys / typed fields)";
    if (isStringOrNumberRecord(node)) return "`Record<string|number, …>` dict (use closed-union keys / typed fields)";
    if (
      (ts.isPropertySignature(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isMethodSignature(node) ||
        ts.isParameter(node)) &&
      node.questionToken !== undefined
    ) {
      return "optional `?:` (use null / required field / default param)";
    }
    return null;
  });
}

if (violations.length > 0) {
  console.error(`type-guard: ${violations.length} violation(s)`);
  for (const v of violations) console.error("  " + v);
  console.error("Fix: name imports/exports explicitly; in core use null/required/default and closed-union maps; move unsafe ops to src/shell via brand()/decode(). See AGENTS.md.");
  process.exit(1);
}

console.log(`type-guard: clean (${srcDir} wildcards/suppressions, ${coreDir} types)`);
