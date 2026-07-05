import { describe, expect, it } from "vitest";
import { brand, isOk } from "@m/std";
import { parseMindmapWithSource } from "../../src/shell/mindmap-parse.js";

const nid = (n: number) => brand<string, "MindmapNodeId">(`n${n}`);

describe("mindmap classSpans (write-side)", () => {
  it("captures an existing ::: span, and a zero-width insertion point when absent", () => {
    const src = "mindmap\n  root((Root))\n    A:::hot\n    B\n";
    const r = parseMindmapWithSource(src);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    // n1 = A (has :::hot), n2 = B (none) — n0 is root.
    const a = r.value.source.classSpans.get(nid(1));
    const b = r.value.source.classSpans.get(nid(2));
    if (a === undefined || b === undefined) throw new Error("no spans");
    expect(src.slice(a.start, a.end)).toBe(":::hot");
    expect(b.start).toBe(b.end); // zero-width insertion point at end of "B"
    expect(src.slice(0, b.start).endsWith("B")).toBe(true);
  });
});
