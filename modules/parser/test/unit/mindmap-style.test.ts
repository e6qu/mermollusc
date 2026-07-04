import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { parseMindmap } from "../../src/shell/mindmap-parse.js";
import { resolveNodeStyles } from "../../src/core/style.js";

describe("mindmap diagram styling", () => {
  it("accepts classDef and applies an inline ::: class to the tagged node", () => {
    const r = parseMindmap("mindmap\n  root((Root))\n    A:::hot\n    B\n  classDef hot fill:#f96\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    // Directive lines are not nodes: Root, A, B only.
    expect(r.value.nodes.map((n) => n.label)).toEqual(["Root", "A", "B"]);
    const colours = resolveNodeStyles(r.value.styles);
    // A is n1 (root n0, A n1, B n2); the ::: synthesised a class against the generated id.
    expect(colours.get("n1")).toEqual({ fill: "#f96", stroke: null });
    expect(colours.get("n2")).toBeUndefined();
  });
  it("still parses a plain mindmap (no directives)", () => {
    const r = parseMindmap("mindmap\n  root((Root))\n    A\n    B\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    expect(r.value.styles).toEqual([]);
    expect(r.value.nodes).toHaveLength(3);
  });
});
