import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseWithSource } from "../../src/shell/parse.js";

const nid = (s: string) => brand<string, "NodeId">(s);

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
});
