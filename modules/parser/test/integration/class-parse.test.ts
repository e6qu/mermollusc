import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseClass, parseClassWithSource } from "../../src/shell/class-parse.js";

const eid = (s: string) => brand<string, "ClassEntityId">(s);
const rid = (s: string) => brand<string, "ClassRelId">(s);

describe("parseClass", () => {
  it("parses class bodies into visibility-tagged field/method members", () => {
    const text = `classDiagram
  class Animal {
    +int age
    -String name
    +isMammal() bool
  }
`;
    const r = parseClass(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const animal = r.value.entities.find((e) => e.id === "Animal");
    expect(animal?.members).toEqual([
      { visibility: "public", text: "int age", kind: "field" },
      { visibility: "private", text: "String name", kind: "field" },
      { visibility: "public", text: "isMammal() bool", kind: "method" },
    ]);
  });

  it("maps each UML relationship operator to its arrowheads + stroke", () => {
    const text = `classDiagram
  Animal <|-- Duck : extends
  Animal *-- Leg
  Animal o-- Habitat
  Animal --> Food
  Animal ..> Util
  Shape ..|> Drawable
`;
    const r = parseClass(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const rels = r.value.relationships;
    // Inheritance: hollow triangle at the base (the `from`/left side), solid line, labelled.
    expect(rels[0]).toMatchObject({
      from: "Animal",
      to: "Duck",
      fromArrow: "triangle",
      toArrow: "none",
      dashed: false,
      label: "extends",
    });
    expect(rels[1]).toMatchObject({ fromArrow: "diamondFilled", dashed: false }); // composition
    expect(rels[2]).toMatchObject({ fromArrow: "diamondHollow" }); // aggregation
    expect(rels[3]).toMatchObject({ toArrow: "arrowOpen", dashed: false }); // association
    expect(rels[4]).toMatchObject({ toArrow: "arrowOpen", dashed: true }); // dependency
    expect(rels[5]).toMatchObject({ toArrow: "triangle", dashed: true }); // realization
  });

  it("supports the `Class : member` shorthand and records name + label spans", () => {
    const text = "classDiagram\n  Duck : +String beakColor\n  Animal --> Duck : eats\n";
    const r = parseClassWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.entities.find((e) => e.id === "Duck")?.members).toEqual([
      { visibility: "public", text: "String beakColor", kind: "field" },
    ]);
    expect(r.value.source.entities.get(eid("Animal"))).toBeDefined();
    const span = r.value.source.relationships.get(rid("r0"));
    if (span !== undefined) expect(text.slice(span.start, span.end)).toBe("eats");
  });

  it("fails loudly on a malformed relationship", () => {
    expect(isOk(parseClass("classDiagram\n  A === B\n"))).toBe(false);
  });
});
