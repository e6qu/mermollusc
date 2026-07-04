import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { parseNetwork } from "../../src/shell/net-parse.js";
import { resolveNodeStyles } from "../../src/core/style.js";

describe("network diagram styling", () => {
  it("accepts classDef + class and applies the colour to the node", () => {
    const r = parseNetwork('network\n  server web1 "Web"\n  database db1 "DB"\n  web1 -- db1\n  classDef hot fill:#f96\n  class web1 hot\n');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    expect(r.value.nodes.map((n) => n.id)).toContain("web1");
    expect(resolveNodeStyles(r.value.styles).get("web1")).toEqual({ fill: "#f96", stroke: null });
  });
  it("still parses a plain network diagram (no directives)", () => {
    const r = parseNetwork("network\n  server a\n  host b\n  a -- b\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    expect(r.value.styles).toEqual([]);
  });
});
