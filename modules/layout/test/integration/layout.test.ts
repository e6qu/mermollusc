import { brand, isOk, point } from "@m/std";
import type { FlowchartAst, NodeId, SequenceAst } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { layout, layoutDiagram } from "../../src/shell/elk.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);
const aid = (s: string) => brand<string, "ActorId">(s);
const mid = (s: string) => brand<string, "MessageId">(s);

const A_THEN_B: FlowchartAst = {
  kind: "flowchart",
  direction: "TB",
  nodes: [
    { id: nid("A"), label: "A", shape: "rect" },
    { id: nid("B"), label: "B", shape: "rect" },
  ],
  edges: [{ id: eid("e0"), from: nid("A"), to: nid("B"), kind: "arrow", label: null }],
  subgraphs: [],
};

const yOf = (scene: { nodes: ReadonlyArray<{ id: string; bounds: { origin: { y: number } } }> }, id: string) =>
  scene.nodes.find((n) => n.id === id)?.bounds.origin.y ?? Number.NaN;

describe("layout", () => {
  it("positions a small flowchart into a non-degenerate scene", async () => {
    const ast: FlowchartAst = {
      kind: "flowchart",
      direction: "TB",
      nodes: [
        { id: nid("A"), label: "Start", shape: "rect" },
        { id: nid("B"), label: "End", shape: "round" },
      ],
      edges: [{ id: eid("e0"), from: nid("A"), to: nid("B"), kind: "arrow", label: null }],
      subgraphs: [],
    };

    const r = await layout(ast);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    expect(r.value.nodes).toHaveLength(2);
    expect(r.value.edges).toHaveLength(1);
    const a = r.value.nodes[0];
    const b = r.value.nodes[1];
    if (a === undefined || b === undefined) throw new Error("missing nodes");
    expect(a.bounds.origin.y).not.toBe(b.bounds.origin.y);
    expect(r.value.edges[0]?.waypoints.length ?? 0).toBeGreaterThan(0);
    expect(r.value.extent.size.width).toBeGreaterThan(0);
  });

  it("relaxes around a seed: flipped seed order flips the layout", async () => {
    const clean = await layout(A_THEN_B);
    expect(isOk(clean)).toBe(true);
    if (!isOk(clean)) return;
    // clean top-down: A above B
    expect(yOf(clean.value, "A")).toBeLessThan(yOf(clean.value, "B"));

    const seed = new Map<NodeId, ReturnType<typeof point>>([
      [nid("A"), point(0, 300)],
      [nid("B"), point(0, 0)],
    ]);
    const relaxed = await layout(A_THEN_B, seed);
    expect(isOk(relaxed)).toBe(true);
    if (!isOk(relaxed)) return;
    // seeded with A below B → relaxed layout keeps A below B
    expect(yOf(relaxed.value, "A")).toBeGreaterThan(yOf(relaxed.value, "B"));
  });

  it("layoutDiagram routes both families to a Scene", async () => {
    const flow = await layoutDiagram(A_THEN_B);
    expect(isOk(flow)).toBe(true);

    const seq: SequenceAst = {
      kind: "sequence",
      actors: [
        { id: aid("X"), label: "X" },
        { id: aid("Y"), label: "Y" },
      ],
      messages: [{ id: mid("m0"), from: aid("X"), to: aid("Y"), text: "hi", kind: "solid" }],
    };
    const sequence = await layoutDiagram(seq);
    expect(isOk(sequence)).toBe(true);
    if (!isOk(sequence)) return;
    expect(sequence.value.nodes).toHaveLength(2);
  });
});
