import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { parseCloud } from "../../src/shell/cloud-parse.js";
import { resolveNodeStyles } from "../../src/core/style.js";

describe("cloud diagram styling", () => {
  it("accepts classDef + class and applies the colour to the node", () => {
    const r = parseCloud('cloud\n  compute web1 "Web"\n  storage s1 "S3"\n  web1 --> s1\n  classDef hot fill:#f96\n  class web1 hot\n');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    expect(r.value.nodes.map((n) => n.id)).toContain("web1");
    expect(resolveNodeStyles(r.value.styles).get("web1")).toEqual({ fill: "#f96", stroke: null });
  });
  it("still parses a plain cloud diagram (no directives)", () => {
    const r = parseCloud("cloud\n  compute a\n  storage b\n  a --> b\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    expect(r.value.styles).toEqual([]);
  });
});
