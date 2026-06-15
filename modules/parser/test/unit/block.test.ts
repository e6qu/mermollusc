import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseBlock } from "../../src/shell/block-parse.js";

describe("parseBlock", () => {
  it("parses block declarations with shapes, a columns directive, and edges", () => {
    const text = 'block-beta\n  columns 2\n  a["Web"]\n  b(API)\n  c\n  a --> b\n';
    const r = parseBlock(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    expect(r.value.kind).toBe("block");
    expect(r.value.columns).toBe(2);
    expect(r.value.blocks.map((b) => [b.id, b.label, b.shape])).toEqual([
      ["a", "Web", "rect"],
      ["b", "API", "round"],
      ["c", "c", "rect"],
    ]);
    expect(r.value.edges).toHaveLength(1);
    expect(r.value.edges[0]?.from).toBe("a");
    expect(r.value.edges[0]?.to).toBe("b");
    expect(r.value.edges[0]?.kind).toBe("arrow");
  });

  it("defaults columns to a single row when the directive is omitted", () => {
    const r = parseBlock("block-beta\n  a b c\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.blocks).toHaveLength(3);
    expect(r.value.columns).toBe(3);
  });

  it("keeps a dotted-link edge label", () => {
    const r = parseBlock("block-beta\n  a -.->|maybe| b\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.edges[0]?.kind).toBe("dotted");
    expect(r.value.edges[0]?.label).toBe("maybe");
  });
});
