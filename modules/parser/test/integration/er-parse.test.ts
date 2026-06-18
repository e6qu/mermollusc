import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseEr, parseErWithSource } from "../../src/shell/er-parse.js";

const eid = (s: string) => brand<string, "ErEntityId">(s);
const rid = (s: string) => brand<string, "ErRelId">(s);

describe("parseEr", () => {
  it("parses relationships with crow's-foot cardinality and entities from endpoints", () => {
    const text = `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
`;
    const r = parseEr(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.entities.map((e) => e.id)).toEqual(["CUSTOMER", "ORDER", "LINE-ITEM"]);
    expect(r.value.relationships[0]).toMatchObject({
      from: "CUSTOMER",
      to: "ORDER",
      fromCard: "one",
      toCard: "zeroOrMany",
      identifying: true,
      label: "places",
    });
    expect(r.value.relationships[1]).toMatchObject({ toCard: "oneOrMany", label: "contains" });
  });

  it("handles non-identifying `..`, quoted entity names, and a bare entity", () => {
    const text = 'erDiagram\n  "Order Line" }o..|| PRODUCT\n  STANDALONE\n';
    const r = parseEr(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.entities.map((e) => e.id)).toEqual(["Order Line", "PRODUCT", "STANDALONE"]);
    expect(r.value.relationships[0]).toMatchObject({
      from: "Order Line",
      fromCard: "zeroOrMany",
      toCard: "one",
      identifying: false,
      label: "",
    });
  });

  it("records relabel spans for the relationship label", () => {
    const text = "erDiagram\n  A ||--o{ B : owns\n";
    const r = parseErWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const span = r.value.source.relationships.get(rid("r0"));
    expect(span).toBeDefined();
    if (span !== undefined) expect(text.slice(span.start, span.end)).toBe("owns");
    expect(r.value.source.entities.get(eid("A"))).toBeDefined();
  });

  it("parses an entity attribute block: types, names, keys, and comments", () => {
    const text = `erDiagram
  CUSTOMER {
    string name PK "the customer's name"
    int age
    string email UK,FK
  }
  CUSTOMER ||--o{ ORDER : places
`;
    const r = parseEr(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const customer = r.value.entities.find((e) => e.id === "CUSTOMER");
    expect(customer?.attributes).toEqual([
      { type: "string", name: "name", keys: ["PK"], comment: "the customer's name" },
      { type: "int", name: "age", keys: [], comment: "" },
      { type: "string", name: "email", keys: ["UK", "FK"], comment: "" },
    ]);
    // The entity is still wired into the relationship; ORDER carries no attributes.
    expect(r.value.relationships[0]).toMatchObject({ from: "CUSTOMER", to: "ORDER" });
    expect(r.value.entities.find((e) => e.id === "ORDER")?.attributes).toEqual([]);
  });

  it("fails loudly on a malformed relationship", () => {
    expect(isOk(parseEr("erDiagram\n  A -- B\n"))).toBe(false);
  });
});
