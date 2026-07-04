import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { parseEr } from "../../src/shell/er-parse.js";
import { resolveNodeStyles } from "../../src/core/style.js";

describe("er diagram styling", () => {
  it("accepts classDef + class and applies the colour to the entity", () => {
    const r = parseEr(
      "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  classDef hot fill:#f96\n  class CUSTOMER hot\n",
    );
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    expect(r.value.entities.map((e) => e.id)).toContain("CUSTOMER");
    expect(resolveNodeStyles(r.value.styles).get("CUSTOMER")).toEqual({ fill: "#f96", stroke: null });
  });
  it("still parses a plain ER diagram (no directives)", () => {
    const r = parseEr("erDiagram\n  A ||--o{ B : has\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    expect(r.value.styles).toEqual([]);
  });
});
