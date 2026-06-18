import { isOk } from "@m/std";
import type { C4Element } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { parseC4 } from "../../src/shell/c4-parse.js";

describe("parseC4", () => {
  it("parses elements, boundary nesting, and relations", () => {
    const text = `C4Context
  Person(alice, "Alice")
  Boundary(backend, "Backend") {
    Container(api, "API")
    Container(db, "Database")
  }
  Rel(alice, api, "uses")
`;
    const r = parseC4(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const byId = new Map<string, C4Element>(r.value.elements.map((e) => [e.id, e]));
    expect(byId.get("alice")).toMatchObject({ kind: "person", parent: null });
    expect(byId.get("backend")).toMatchObject({ kind: "boundary", parent: null });
    expect(byId.get("api")).toMatchObject({ kind: "container", parent: "backend" });
    expect(byId.get("db")?.parent).toBe("backend");
    expect(r.value.rels[0]).toMatchObject({ from: "alice", to: "api", label: "uses" });
  });

  it("captures the optional description, leaving it null when omitted", () => {
    const r = parseC4('C4Context\n  Person(alice, "Alice", "A customer")\n  System(web, "Web")\n');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const byId = new Map<string, C4Element>(r.value.elements.map((e) => [e.id, e]));
    expect(byId.get("alice")).toMatchObject({ label: "Alice", description: "A customer" });
    expect(byId.get("web")?.description).toBeNull();
  });

  it("fails loudly on a malformed element", () => {
    const r = parseC4('C4Context\n  Person(alice "missing comma")\n');
    expect(isOk(r)).toBe(false);
  });
});
