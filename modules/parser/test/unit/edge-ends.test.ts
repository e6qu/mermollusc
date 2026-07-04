import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { parseWithSource } from "../../src/shell/parse.js";

const slice = (text: string, span: { start: number; end: number }) =>
  text.slice(span.start, span.end);

describe("edgeEnds source spans", () => {
  it("points at each endpoint's declaration (incl. inline shape)", () => {
    const text = "flowchart LR\n  A[Alpha] --> B[Beta]\n";
    const r = parseWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const ends = r.value.source.edgeEnds.get(r.value.ast.edges[0]!.id);
    expect(ends).toBeDefined();
    if (ends === undefined) return;
    expect(slice(text, ends.from)).toBe("A[Alpha]");
    expect(slice(text, ends.to)).toBe("B[Beta]");
  });

  it("a chain shares the middle node's span between two edges (so reconnect can detect it)", () => {
    const text = "flowchart LR\n  A --> B --> C\n";
    const r = parseWithSource(text);
    if (!isOk(r)) throw new Error("parse failed");
    const e0 = r.value.source.edgeEnds.get(r.value.ast.edges[0]!.id);
    const e1 = r.value.source.edgeEnds.get(r.value.ast.edges[1]!.id);
    expect(e0?.to).toEqual(e1?.from); // both reference the single `B` token
  });
});
