import { brand, isOk } from "@m/std";
import { parseWithSource } from "@m/parser";
import { describe, expect, it } from "vitest";
import { patchSpan, relabelNode } from "../../src/core/patch.js";

const nid = (s: string) => brand<string, "NodeId">(s);

const sourceOf = (text: string) => {
  const r = parseWithSource(text);
  if (!isOk(r)) throw new Error(`parse failed: ${r.error.errors.join("; ")}`);
  return r.value.source;
};

describe("relabelNode", () => {
  it("splices a bracketed node's label, preserving the rest of the file", () => {
    const text = "flowchart TD\n  A[Start] --> B(End)\n";
    const r = relabelNode(text, sourceOf(text), nid("A"), "Begin");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value).toBe("flowchart TD\n  A[Begin] --> B(End)\n");

    const reparsed = parseWithSource(r.value);
    expect(isOk(reparsed)).toBe(true);
    if (!isOk(reparsed)) return;
    expect(reparsed.value.ast.nodes.find((n) => n.id === "A")?.label).toBe("Begin");
  });

  it("wraps a bare node in brackets when relabeling", () => {
    const text = "flowchart TD\n  A --> B\n";
    const r = relabelNode(text, sourceOf(text), nid("A"), "Start");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value).toBe("flowchart TD\n  A[Start] --> B\n");
  });

  it("fails loudly for an unknown node", () => {
    const text = "flowchart TD\n  A --> B\n";
    expect(relabelNode(text, sourceOf(text), nid("Z"), "x").ok).toBe(false);
  });

  it("patchSpan replaces exactly the given range", () => {
    expect(patchSpan("hello world", { start: 6, end: 11 }, "there")).toBe("hello there");
  });
});
