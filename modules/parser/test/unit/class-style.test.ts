import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { parseClass } from "../../src/shell/class-parse.js";
import { resolveNodeStyles } from "../../src/core/style.js";

const parsed = (s: string) => {
  const r = parseClass(s);
  if (!isOk(r)) throw new Error("parse failed");
  return r.value;
};

describe("class diagram styling", () => {
  it("applies classDef via inline ::: on a declaration and a relationship endpoint", () => {
    const v = parsed(
      "classDiagram\n  class Animal:::hot\n  class Dog\n  Animal <|-- Dog:::cold\n  classDef hot fill:#f00\n  classDef cold fill:#00f\n",
    );
    expect(v.entities.map((e) => e.id).sort()).toEqual(["Animal", "Dog"]);
    const c = resolveNodeStyles(v.styles);
    expect(c.get("Animal")?.fill).toBe("#f00");
    expect(c.get("Dog")?.fill).toBe("#00f");
  });
  it("applies cssClass bulk assignment", () => {
    const v = parsed('classDiagram\n  class A\n  class B\n  cssClass "A,B" hot\n  classDef hot fill:#0f0\n');
    const c = resolveNodeStyles(v.styles);
    expect(c.get("A")?.fill).toBe("#0f0");
    expect(c.get("B")?.fill).toBe("#0f0");
  });
  it("does not mis-assign a right-only ::: to the left endpoint", () => {
    const v = parsed("classDiagram\n  A --> B:::hot\n  classDef hot fill:#0f0\n");
    const c = resolveNodeStyles(v.styles);
    expect(c.get("A")).toBeUndefined();
    expect(c.get("B")?.fill).toBe("#0f0");
  });
  it("leaves a plain declaration (and its members) untouched — no keyword-collision", () => {
    const v = parsed("classDiagram\n  class Animal\n  Animal : +int age\n");
    expect(v.entities.map((e) => e.id)).toEqual(["Animal"]);
    expect(v.styles).toEqual([]);
    expect(v.entities[0]?.members).toHaveLength(1);
  });
});
