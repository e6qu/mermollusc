import { brand, isOk } from "@m/std";
import { parseWithSource } from "@m/parser";
import { describe, expect, it } from "vitest";
import { addNode, connect, deleteNode, patchSpan, relabelNode } from "../../src/core/patch.js";

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

  it("addNode appends a node declaration the parser accepts", () => {
    const next = addNode("flowchart TD\n  A --> B\n", nid("C"), "Gamma", "round");
    expect(next).toContain("C(Gamma)");
    const r = parseWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.nodes.find((n) => n.id === "C")).toMatchObject({
      label: "Gamma",
      shape: "round",
    });
  });

  it("connect appends an edge the parser accepts", () => {
    const next = connect("flowchart TD\n  A[x]\n  B[y]\n", nid("A"), nid("B"), "dotted");
    expect(next).toContain("A -.-> B");
    const r = parseWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(
      r.value.ast.edges.some((e) => e.from === "A" && e.to === "B" && e.kind === "dotted"),
    ).toBe(true);
  });

  it("deleteNode removes the node's declaration and its edges", () => {
    const next = deleteNode("flowchart TD\n  A[x]\n  B[y]\n  A --> B\n", nid("A"));
    expect(next).not.toContain("A[x]");
    expect(next).not.toContain("A --> B");
    const r = parseWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.nodes.map((n) => n.id)).toEqual(["B"]);
  });

  it("deleteNode does not match an id that only appears inside a label", () => {
    const text = "flowchart TD\n  A[mentions B]\n  C --> A\n";
    expect(deleteNode(text, nid("B"))).toBe(text);
  });
});
