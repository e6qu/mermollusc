import { brand, isOk } from "@m/std";
import {
  parseC4WithSource,
  parseNetworkWithSource,
  parseSequenceWithSource,
  parseWithSource,
} from "@m/parser";
import { describe, expect, it } from "vitest";
import {
  addNode,
  connect,
  connectC4,
  connectMessage,
  connectUndirected,
  deleteEdge,
  deleteNode,
  patchSpan,
  relabelNode,
} from "../../src/core/patch.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const cid = (s: string) => brand<string, "C4ElementId">(s);
const aid = (s: string) => brand<string, "ActorId">(s);

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

  it("connectUndirected appends a link the network parser accepts", () => {
    const next = connectUndirected('network\n  server a "A"\n  server b "B"\n', nid("a"), nid("b"));
    expect(next).toContain("a -- b");
    const r = parseNetworkWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.links.some((l) => l.from === "a" && l.to === "b")).toBe(true);
  });

  it("connectC4 appends a Rel the C4 parser accepts", () => {
    const next = connectC4('C4Context\n  Person(a, "A")\n  System(b, "B")\n', cid("a"), cid("b"));
    expect(next).toContain('Rel(a, b, "")');
    const r = parseC4WithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.rels.some((rel) => rel.from === "a" && rel.to === "b")).toBe(true);
  });

  it("connectMessage appends a message the sequence parser accepts", () => {
    const next = connectMessage("sequenceDiagram\n  A->>B: hi\n", aid("A"), aid("B"));
    expect(next).toContain("A->>B: message");
    const r = parseSequenceWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.messages.filter((m) => m.from === "A" && m.to === "B")).toHaveLength(2);
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

  it("deleteEdge removes the standalone edge line, keeping declarations and other edges", () => {
    const next = deleteEdge("flowchart TD\n  A[x]\n  B[y]\n  A -->|go| B\n  B --> C\n", nid("A"), nid("B"));
    expect(next).not.toContain("A -->|go| B");
    expect(next).toContain("A[x]");
    expect(next).toContain("B --> C");
    const r = parseWithSource(next);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.edges.map((e) => [e.from, e.to])).toEqual([["B", "C"]]);
  });

  it("deleteEdge leaves multi-hop chains intact (only matches a 2-id edge line)", () => {
    const text = "flowchart TD\n  A --> B --> C\n";
    expect(deleteEdge(text, nid("A"), nid("B"))).toBe(text);
  });
});
