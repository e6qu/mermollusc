import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseC4WithSource } from "../../src/shell/c4-parse.js";

const eid = (s: string) => brand<string, "C4ElementId">(s);
const rid = (s: string) => brand<string, "C4RelId">(s);

const SAMPLE = `C4Context
  Person(user, "Customer")
  System(web, "Web App")
  Boundary(b1, "Backend") {
    Container(api, "API")
  }
  Rel(user, web, "uses")
`;

describe("parseC4WithSource", () => {
  it("captures the inner label span of each element (incl. boundaries and nested children)", () => {
    const r = parseC4WithSource(SAMPLE);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const at = (id: string) => {
      const span = r.value.source.elements.get(eid(id));
      expect(span).toBeDefined();
      return span === undefined ? "" : SAMPLE.slice(span.start, span.end);
    };
    expect(at("user")).toBe("Customer");
    expect(at("web")).toBe("Web App");
    expect(at("b1")).toBe("Backend");
    expect(at("api")).toBe("API");
  });

  it("captures the inner label span of each relation", () => {
    const r = parseC4WithSource(SAMPLE);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const span = r.value.source.rels.get(rid("r0"));
    expect(span).toBeDefined();
    if (span === undefined) return;
    expect(SAMPLE.slice(span.start, span.end)).toBe("uses");
  });

  it("yields the same AST as parseC4", () => {
    const r = parseC4WithSource(SAMPLE);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.elements.map((e) => e.label)).toEqual([
      "Customer",
      "Web App",
      "Backend",
      "API",
    ]);
    expect(r.value.ast.rels[0]?.label).toBe("uses");
  });
});
