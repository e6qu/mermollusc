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
