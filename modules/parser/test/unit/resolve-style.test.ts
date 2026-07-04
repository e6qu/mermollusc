import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { resolveNodeStyles } from "../../src/core/style.js";
import { parse } from "../../src/shell/parse.js";

const stylesOf = (src: string) => {
  const r = parse(src);
  if (!isOk(r)) throw new Error("parse failed: " + JSON.stringify(r));
  return r.value.styles;
};

describe("resolveNodeStyles", () => {
  it("resolves an inline style directive", () => {
    const m = resolveNodeStyles(stylesOf("flowchart TD\n  A-->B\n  style A fill:#f9f,stroke:#333\n"));
    expect(m.get("A")).toEqual({ fill: "#f9f", stroke: "#333" });
    expect(m.get("B")).toBeUndefined();
  });
  it("resolves classDef + class", () => {
    const m = resolveNodeStyles(stylesOf("flowchart TD\n  A-->B\n  classDef hot fill:#16a34a\n  class B hot\n"));
    expect(m.get("B")).toEqual({ fill: "#16a34a", stroke: null });
  });
  it("inline style overrides a class colour", () => {
    const m = resolveNodeStyles(stylesOf("flowchart TD\n  A-->B\n  classDef hot fill:#111\n  class A hot\n  style A fill:#222\n"));
    expect(m.get("A")?.fill).toBe("#222");
  });
});

import { resolveLinkStyles } from "../../src/core/style.js";
describe("resolveLinkStyles", () => {
  it("resolves a single-index linkStyle stroke", () => {
    const r = parse("flowchart TD\n  A-->B\n  A-->C\n  linkStyle 1 stroke:#f00\n");
    if (!isOk(r)) throw new Error("parse failed");
    const m = resolveLinkStyles(r.value.styles);
    expect(m.get(1)).toEqual({ fill: null, stroke: "#f00" });
    expect(m.get(0)).toBeUndefined();
  });
  it("ignores linkStyle default / non-numeric targets", () => {
    const r = parse("flowchart TD\n  A-->B\n  linkStyle default stroke:#f00\n");
    if (!isOk(r)) throw new Error("parse failed");
    expect(resolveLinkStyles(r.value.styles).size).toBe(0);
  });
});
