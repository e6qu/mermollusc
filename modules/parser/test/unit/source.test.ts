import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseWithSource } from "../../src/shell/parse.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

describe("parseWithSource", () => {
  it("captures the label span of shaped nodes", () => {
    const text = "flowchart TD\n  A[Start] --> B(End)\n";
    const r = parseWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const a = r.value.source.nodes.get(nid("A"));
    const b = r.value.source.nodes.get(nid("B"));
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (a === undefined || b === undefined) return;

    expect(text.slice(a.label.start, a.label.end)).toBe("Start");
    expect(a.bracketed).toBe(true);
    expect(text.slice(b.label.start, b.label.end)).toBe("End");
  });

  it("uses the id span for a bare node", () => {
    const text = "flowchart TD\n  A --> B\n";
    const r = parseWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const a = r.value.source.nodes.get(nid("A"));
    expect(a).toBeDefined();
    if (a === undefined) return;
    expect(text.slice(a.label.start, a.label.end)).toBe("A");
    expect(a.bracketed).toBe(false);
  });

  it("captures the trimmed `|label|` span of an edge (and none for a bare link)", () => {
    const text = "flowchart TD\n  A -->| yes | B\n  B --> C\n";
    const r = parseWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const e0 = r.value.source.edges.get(eid("e0"));
    expect(e0).toBeDefined();
    if (e0 !== undefined) expect(text.slice(e0.start, e0.end)).toBe("yes");
    // The unlabelled second edge has no span.
    expect(r.value.source.edges.get(eid("e1"))).toBeUndefined();
  });
});
