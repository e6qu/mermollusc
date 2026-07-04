// Resolves Mermaid styling directives (carried verbatim on `FlowchartAst.styles`) into concrete
// per-node fill/stroke colours the renderer can apply. Pure: string directives → a colour map.
//
// Precedence follows Mermaid: a `classDef` defines a named property set, `class A,B name` applies it to
// nodes, and an inline `style A …` overrides. So we apply class-derived colours first, then let inline
// `style` directives win. Only `fill`/`stroke` are extracted (other properties like `stroke-width` are
// preserved verbatim in the source for round-trip but don't affect the box colour). `linkStyle` targets
// edges, not nodes, so it's ignored here.

import type { FlowStyle } from "@m/contracts";

export interface FlowNodeColors {
  readonly fill: string | null;
  readonly stroke: string | null;
}

// Split a property list on commas that are NOT inside parentheses, so a value like `rgb(1,2,3)` or
// `hsl(…)` stays intact (its internal commas aren't property separators).
const splitTopLevel = (text: string): readonly string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
};

// Parse a `fill:#f9f,stroke:#333,stroke-width:2px` property list into the fill/stroke we render.
const parseProps = (propsText: string): FlowNodeColors => {
  let fill: string | null = null;
  let stroke: string | null = null;
  for (const part of splitTopLevel(propsText)) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (value === "") continue;
    if (key === "fill") fill = value;
    else if (key === "stroke") stroke = value;
  }
  return { fill, stroke };
};

// A directive's `<targets> <rest>` split — targets are the leading comma-separated ids, `rest` the
// remainder (a property list, or a class name for `class`). Null when the shape doesn't match (the
// lexer's token pattern guarantees it does, so this is just exhaustiveness, not a silent fallback).
const splitTargets = (
  raw: string,
  keyword: string,
): { readonly targets: readonly string[]; readonly rest: string } | null => {
  const after = raw.slice(keyword.length).trimStart();
  const sp = after.search(/[ \t]/);
  if (sp < 0) return null;
  const targets = after
    .slice(0, sp)
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
  return { targets, rest: after.slice(sp).trim() };
};

// Split a PROPERTY directive (`style`/`classDef`/`linkStyle`) at the start of its property list — the
// first `key:` — so the target list can contain whitespace (Mermaid allows `linkStyle 0, 1 stroke:…`)
// without a space being mistaken for the target/props boundary. Node ids, indices and class names carry
// no colon, so the first `[A-Za-z-]+:` is unambiguously the first property. Null when there's no
// property list at all.
const splitProps = (
  raw: string,
  keyword: string,
): { readonly targets: readonly string[]; readonly rest: string } | null => {
  const after = raw.slice(keyword.length).trimStart();
  const m = /[A-Za-z-]+[ \t]*:/.exec(after);
  if (m === null) return null;
  const targets = after
    .slice(0, m.index)
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
  return { targets, rest: after.slice(m.index) };
};

// Merge `next` over `prev`, letting a non-null value win (so a later directive overrides an earlier one).
const merge = (prev: FlowNodeColors, next: FlowNodeColors): FlowNodeColors => ({
  fill: next.fill ?? prev.fill,
  stroke: next.stroke ?? prev.stroke,
});

const EMPTY: FlowNodeColors = { fill: null, stroke: null };

// Keyed by the raw node-id string (the caller matches these against scene-node ids), so the pure core
// mints no branded ids.
export const resolveNodeStyles = (
  styles: readonly FlowStyle[],
): ReadonlyMap<string, FlowNodeColors> => {
  const classDefs = new Map<string, FlowNodeColors>();
  for (const s of styles) {
    if (s.kind !== "classDef") continue;
    const split = splitProps(s.raw, "classDef");
    if (split === null) continue;
    const props = parseProps(split.rest);
    for (const name of split.targets) classDefs.set(name, props);
  }

  const result = new Map<string, FlowNodeColors>();
  const apply = (id: string, props: FlowNodeColors): void => {
    result.set(id, merge(result.get(id) ?? EMPTY, props));
  };

  // class assignments first…
  for (const s of styles) {
    if (s.kind !== "class") continue;
    const split = splitTargets(s.raw, "class");
    if (split === null) continue;
    const props = classDefs.get(split.rest.trim());
    if (props === undefined) continue;
    for (const id of split.targets) apply(id, props);
  }
  // …then inline `style` directives override.
  for (const s of styles) {
    if (s.kind !== "style") continue;
    const split = splitProps(s.raw, "style");
    if (split === null) continue;
    const props = parseProps(split.rest);
    for (const id of split.targets) apply(id, props);
  }
  return result;
};

// The `classDef default …` style, if present — Mermaid applies it to EVERY node that has no more
// specific colour. Returned separately (not fanned out here) because the resolver has no node list; the
// caller applies it to unstyled nodes. Null when there's no `default` classDef.
export const resolveDefaultNodeStyle = (styles: readonly FlowStyle[]): FlowNodeColors | null => {
  let result: FlowNodeColors | null = null;
  for (const s of styles) {
    if (s.kind !== "classDef") continue;
    const split = splitProps(s.raw, "classDef");
    if (split === null || !split.targets.includes("default")) continue;
    result = merge(result ?? EMPTY, parseProps(split.rest));
  }
  return result;
};

// The `linkStyle default …` stroke, if present — Mermaid applies it to EVERY edge with no explicit
// `linkStyle <index>`. Null when absent. Same rationale as `resolveDefaultNodeStyle`.
export const resolveDefaultLinkStyle = (styles: readonly FlowStyle[]): FlowNodeColors | null => {
  let result: FlowNodeColors | null = null;
  for (const s of styles) {
    if (s.kind !== "linkStyle") continue;
    const split = splitProps(s.raw, "linkStyle");
    if (split === null || !split.targets.includes("default")) continue;
    result = merge(result ?? EMPTY, parseProps(split.rest));
  }
  return result;
};

// `linkStyle <indices> stroke:…` colours edges BY INDEX (declaration order). Resolves to a per-index
// stroke colour (fill is meaningless on a connector). `linkStyle default …` is handled by
// `resolveDefaultLinkStyle` (it fans out to every edge, which needs the caller's edge list).
export const resolveLinkStyles = (
  styles: readonly FlowStyle[],
): ReadonlyMap<number, FlowNodeColors> => {
  const result = new Map<number, FlowNodeColors>();
  for (const s of styles) {
    if (s.kind !== "linkStyle") continue;
    const split = splitProps(s.raw, "linkStyle");
    if (split === null) continue;
    const props = parseProps(split.rest);
    for (const t of split.targets) {
      const idx = Number.parseInt(t, 10);
      if (!Number.isInteger(idx) || String(idx) !== t) continue;
      result.set(idx, merge(result.get(idx) ?? EMPTY, props));
    }
  }
  return result;
};
