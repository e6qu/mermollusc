import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseRequirement, parseRequirementWithSource } from "../../src/shell/req-parse.js";

const eid = (s: string) => brand<string, "ReqEntityId">(s);
const rid = (s: string) => brand<string, "ReqRelId">(s);

describe("parseRequirement", () => {
  it("parses requirement + element bodies into key/value fields", () => {
    const text = `requirementDiagram
  requirement test_req {
    id: 1
    text: the test text.
    risk: high
    verifymethod: test
  }
  element test_entity {
    type: simulation
  }
`;
    const r = parseRequirement(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const req = r.value.entities.find((e) => e.id === "test_req");
    expect(req?.kind).toBe("requirement");
    expect(req?.fields).toEqual([
      { key: "id", value: "1" },
      { key: "text", value: "the test text." },
      { key: "risk", value: "high" },
      { key: "verifymethod", value: "test" },
    ]);
    const el = r.value.entities.find((e) => e.id === "test_entity");
    expect(el?.kind).toBe("element");
    expect(el?.fields).toEqual([{ key: "type", value: "simulation" }]);
  });

  it("classifies the six requirement types and parses relationship verbs + direction", () => {
    const text = `requirementDiagram
  functionalRequirement fr { id: 2 }
  designConstraint dc { id: 3 }
  test_entity - satisfies -> test_req
  test_req <- derives - other_req
`;
    const r = parseRequirement(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.entities.find((e) => e.id === "fr")?.kind).toBe("functionalRequirement");
    expect(r.value.entities.find((e) => e.id === "dc")?.kind).toBe("designConstraint");
    // `a - satisfies -> b` is a→b.
    expect(r.value.relationships[0]).toMatchObject({
      from: "test_entity",
      to: "test_req",
      kind: "satisfies",
    });
    // `a <- derives - b` reverses to b→a.
    expect(r.value.relationships[1]).toMatchObject({
      from: "other_req",
      to: "test_req",
      kind: "derives",
    });
  });

  it("records entity-name spans for relabel", () => {
    const text = "requirementDiagram\n  requirement foo { id: 1 }\n";
    const r = parseRequirementWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const span = r.value.source.entities.get(eid("foo"));
    expect(span).toBeDefined();
    if (span !== undefined) expect(text.slice(span.start, span.end)).toBe("foo");
  });

  it("records the relationship verb span so it can be edited inline", () => {
    const text = "requirementDiagram\n  e - satisfies -> r\n";
    const r = parseRequirementWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const span = r.value.source.relationships.get(rid("r0"));
    expect(span).toBeDefined();
    if (span !== undefined) expect(text.slice(span.start, span.end)).toBe("satisfies");
  });

  it("fails loudly on a malformed relationship", () => {
    expect(isOk(parseRequirement("requirementDiagram\n  a = b\n"))).toBe(false);
  });

  it("fails loudly (with a located error) on an unknown relationship verb", () => {
    // `satisfis` is a typo for `satisfies`; the verb lexes as a plain identifier, so this exercises
    // the verb-classification path, not the lexer.
    const text = "requirementDiagram\n  ent - satisfis -> req\n";
    const r = parseRequirement(text);
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    const pos = r.error.positions[0];
    expect(pos).toBeDefined();
    if (pos !== undefined) expect(text.slice(pos.offset, pos.offset + pos.length)).toBe("satisfis");
  });
});
