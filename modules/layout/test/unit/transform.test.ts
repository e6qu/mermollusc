import { brand } from "@m/std";
import type { FlowchartAst } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure, toElkGraph, toScene } from "../../src/core/index.js";
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
  subgraphs: [],
};

describe("toElkGraph", () => {
  it("maps direction and graph shape", () => {
    const g = toElkGraph(ast, new Map(), heuristicMeasure);
    expect(g.config.direction).toBe("RIGHT");
    expect(g.children.map((c) => c.id)).toEqual(["A", "B"]);
    expect(g.edges).toEqual([{ id: "e0", sources: ["A"], targets: ["B"] }]);
    const a = g.children[0];
    expect(a?.kind === "leaf" ? a.width : 0).toBeGreaterThan(0);
  });

  it("sizes circle nodes square (so they render as circles), leaving others as wide boxes", () => {
    const g = toElkGraph({
      kind: "flowchart",
      direction: "TB",
      nodes: [
        { id: nid("C"), label: "Hub", shape: "circle" },
        { id: nid("R"), label: "Wide label here", shape: "rect" },
      ],
      edges: [],
      subgraphs: [],
    }, new Map(), heuristicMeasure);
    const circle = g.children.find((c) => c.id === "C");
    const rectNode = g.children.find((c) => c.id === "R");
    expect(circle?.kind).toBe("leaf");
    expect(rectNode?.kind).toBe("leaf");
    if (circle?.kind !== "leaf" || rectNode?.kind !== "leaf") return;
    expect(circle.width).toBe(circle.height);
    expect(rectNode.width > rectNode.height).toBe(true);
  });
});

describe("toScene", () => {
  const positioned: PositionedGraph = {
    width: 200,
    height: 100,
    nodes: [
      { id: nid("A"), x: 0, y: 0, width: 60, height: 40, parent: null },
      { id: nid("B"), x: 100, y: 0, width: 40, height: 40, parent: null },
    ],
    edges: [{ id: eid("e0"), points: [{ x: 60, y: 20 }, { x: 100, y: 20 }] }],
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
      {
        width: 1,
        height: 1,
        nodes: [{ id: nid("X"), x: 0, y: 0, width: 1, height: 1, parent: null }],
        edges: [],
      },
      ast,
    );
    expect(r.ok).toBe(false);
  });
});
