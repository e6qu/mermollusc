import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { parse } from "../../src/shell/parse.js";
import { resolveLinkStyles, resolveNodeStyles } from "../../src/core/style.js";

const stylesOf = (src: string) => {
  const r = parse(src);
  if (!isOk(r)) throw new Error("parse failed: " + JSON.stringify(r));
  return r.value;
};

describe("style directive Mermaid-compliance fixes", () => {
  it("linkStyle with spaces after commas resolves every index + keeps the stroke", () => {
    const v = stylesOf("flowchart TD\n  A-->B\n  A-->C\n  linkStyle 0, 1 stroke:#f00\n");
    const m = resolveLinkStyles(v.styles);
    expect(m.get(0)).toEqual({ fill: null, stroke: "#f00" });
    expect(m.get(1)).toEqual({ fill: null, stroke: "#f00" });
  });

  it("accepts hyphenated classDef/class names without failing the whole parse", () => {
    const v = stylesOf("flowchart TD\n  A-->B\n  classDef my-cls fill:#f9f\n  class A my-cls\n");
    expect(v.nodes.map((n) => n.id).sort()).toEqual(["A", "B"]);
    expect(resolveNodeStyles(v.styles).get("A")).toEqual({ fill: "#f9f", stroke: null });
  });

  it("does not swallow a `;`-separated statement after a style directive", () => {
    const v = stylesOf("flowchart TD\n  A-->B\n  style A fill:red; C-->D\n");
    expect(v.nodes.map((n) => n.id).sort()).toEqual(["A", "B", "C", "D"]);
    expect(v.edges).toHaveLength(2); // A-->B and C-->D
    expect(resolveNodeStyles(v.styles).get("A")).toEqual({ fill: "red", stroke: null });
  });
});

import { resolveDefaultLinkStyle, resolveDefaultNodeStyle } from "../../src/core/style.js";
describe("classDef/linkStyle default", () => {
  it("resolveDefaultNodeStyle picks up `classDef default`", () => {
    const v = stylesOf("flowchart TD\n  A-->B\n  classDef default fill:#eee,stroke:#333\n");
    expect(resolveDefaultNodeStyle(v.styles)).toEqual({ fill: "#eee", stroke: "#333" });
  });
  it("returns null when there is no default classDef", () => {
    const v = stylesOf("flowchart TD\n  A-->B\n  classDef hot fill:#f96\n");
    expect(resolveDefaultNodeStyle(v.styles)).toBeNull();
  });
  it("resolveDefaultLinkStyle picks up `linkStyle default`", () => {
    const v = stylesOf("flowchart TD\n  A-->B\n  linkStyle default stroke:#f00\n");
    expect(resolveDefaultLinkStyle(v.styles)).toEqual({ fill: null, stroke: "#f00" });
  });
});
