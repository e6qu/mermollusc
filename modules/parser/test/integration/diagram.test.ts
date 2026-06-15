import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseDiagram } from "../../src/shell/diagram.js";

describe("parseDiagram", () => {
  it("routes flowchart headers", () => {
    const r = parseDiagram("flowchart TD\n  A --> B\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.kind).toBe("flowchart");
  });

  it("routes sequenceDiagram headers", () => {
    const r = parseDiagram("sequenceDiagram\n  A->>B: hi\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.kind).toBe("sequence");
  });

  it("routes C4 headers", () => {
    const r = parseDiagram('C4Context\n  Person(a, "A")\n');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.kind).toBe("c4");
  });

  it("skips leading comments/blanks when sniffing", () => {
    const r = parseDiagram("\n%% a note\nsequenceDiagram\n  A->>B: hi\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.kind).toBe("sequence");
  });
});
