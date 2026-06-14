import { brand } from "@m/std";
import type { FlowchartAst } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { toElkGraph, toScene } from "../../src/core/index.js";
import type { PositionedGraph } from "../../src/core/index.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

const ast: FlowchartAst = {
  kind: "flowchart",
  direction: "LR",
  nodes: [
    { id: nid("A"), label: "Start", shape: "rect" },
    { id: nid("B"), label: "B", shape: "rect" },
  ],
  edges: [{ id: eid("e0"), from: nid("A"), to: nid("B"), kind: "arrow", label: null }],
};

describe("toElkGraph", () => {
  it("maps direction and graph shape", () => {
    const g = toElkGraph(ast);
    expect(g.layoutOptions["elk.direction"]).toBe("RIGHT");
    expect(g.children.map((c) => c.id)).toEqual(["A", "B"]);
    expect(g.edges).toEqual([{ id: "e0", sources: ["A"], targets: ["B"] }]);
    expect(g.children[0]?.width ?? 0).toBeGreaterThan(0);
  });
});

describe("toScene", () => {
  const positioned: PositionedGraph = {
    width: 200,
    height: 100,
    nodes: [
      { id: "A", x: 0, y: 0, width: 60, height: 40 },
      { id: "B", x: 100, y: 0, width: 40, height: 40 },
    ],
    edges: [{ id: "e0", points: [{ x: 60, y: 20 }, { x: 100, y: 20 }] }],
  };

  it("maps a positioned graph to a branded scene", () => {
    const r = toScene(positioned, ast);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.nodes).toHaveLength(2);
    expect(r.value.nodes[0]?.bounds.origin.x).toBe(0);
    expect(r.value.nodes[0]?.label).toBe("Start");
    expect(r.value.edges[0]?.waypoints).toHaveLength(2);
    expect(r.value.extent.size.width).toBe(200);
  });

  it("fails loudly when a positioned node is not in the AST", () => {
    const r = toScene(
      { width: 1, height: 1, nodes: [{ id: "X", x: 0, y: 0, width: 1, height: 1 }], edges: [] },
      ast,
    );
    expect(r.ok).toBe(false);
  });
});
