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

// Parse a `fill:#f9f,stroke:#333,stroke-width:2px` property list into the fill/stroke we render.
const parseProps = (propsText: string): FlowNodeColors => {
  let fill: string | null = null;
  let stroke: string | null = null;
  for (const part of propsText.split(",")) {
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
    const split = splitTargets(s.raw, "classDef");
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
    const split = splitTargets(s.raw, "style");
    if (split === null) continue;
    const props = parseProps(split.rest);
    for (const id of split.targets) apply(id, props);
  }
  return result;
};
