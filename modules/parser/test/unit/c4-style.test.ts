import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { parseC4 } from "../../src/shell/c4-parse.js";
import { resolveNodeStyles } from "../../src/core/style.js";

const parsed = (s: string) => {
  const r = parseC4(s);
  if (!isOk(r)) throw new Error("parse failed");
  return r.value;
};

describe("c4 diagram styling", () => {
  it("maps UpdateElementStyle bg/border colours onto fill/stroke", () => {
    const v = parsed(
      'C4Context\n  Person(alice, "Alice")\n  System(sys, "System")\n  UpdateElementStyle(alice, $bgColor="#f00", $borderColor="#333")\n',
    );
    expect(v.elements.map((e) => e.id).sort()).toEqual(["alice", "sys"]);
    expect(resolveNodeStyles(v.styles).get("alice")).toEqual({ fill: "#f00", stroke: "#333" });
  });
  it("accepts UpdateRelStyle without breaking the parse (no edge colour synthesised)", () => {
    const v = parsed(
      'C4Context\n  Person(a, "A")\n  System(b, "B")\n  Rel(a, b, "uses")\n  UpdateRelStyle(a, b, $lineColor="#f00")\n',
    );
    expect(v.rels).toHaveLength(1);
    expect(v.styles).toEqual([]);
  });
  it("still parses a plain C4 diagram", () => {
    const v = parsed('C4Context\n  Person(a, "A")\n  System(b, "B")\n  Rel(a, b, "uses")\n');
    expect(v.styles).toEqual([]);
    expect(v.elements).toHaveLength(2);
  });
});
