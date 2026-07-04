import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { parseBlock } from "../../src/shell/block-parse.js";
import { resolveNodeStyles } from "../../src/core/style.js";

describe("block diagram styling", () => {
  it("accepts classDef + class and applies the colour to the block", () => {
    const r = parseBlock("block-beta\n  columns 2\n  A B\n  classDef hot fill:#f96\n  class A hot\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    expect(r.value.blocks.map((b) => b.id)).toContain("A");
    expect(resolveNodeStyles(r.value.styles).get("A")).toEqual({ fill: "#f96", stroke: null });
  });
  it("still parses a plain block diagram (no directives, no phantom blocks)", () => {
    const r = parseBlock("block-beta\n  A B C\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    expect(r.value.blocks.map((b) => b.id).sort()).toEqual(["A", "B", "C"]);
    expect(r.value.styles).toEqual([]);
  });
});
