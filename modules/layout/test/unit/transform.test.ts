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
    { id: nid("A"), label: "Start", shape: "rect" , icon: null },
    { id: nid("B"), label: "B", shape: "rect" , icon: null },
  ],
  edges: [{ id: eid("e0"), from: nid("A"), to: nid("B"), kind: "arrow", label: null }],
  subgraphs: [],
  styles: [],
};

describe("toElkGraph", () => {
  it("maps direction and graph shape", () => {
    const g = toElkGraph(ast, new Map(), heuristicMeasure);
    expect(g.config.direction).toBe("RIGHT");
    expect(g.children.map((c) => c.id)).toEqual(["A", "B"]);
    expect(g.edges).toEqual([{ id: "e0", sources: ["A"], targets: ["B"], label: null }]);
    const a = g.children[0];
    expect(a?.kind === "leaf" ? a.width : 0).toBeGreaterThan(0);
  });

  it("sizes circle nodes square (so they render as circles), leaving others as wide boxes", () => {
    const g = toElkGraph({
      kind: "flowchart",
      direction: "TB",
      nodes: [
        { id: nid("C"), label: "Hub", shape: "circle" , icon: null },
        { id: nid("R"), label: "Wide label here", shape: "rect" , icon: null },
      ],
      edges: [],
      subgraphs: [],
      styles: [],
    }, new Map(), heuristicMeasure);
    const circle = g.children.find((c) => c.id === "C");
    const rectNode = g.children.find((c) => c.id === "R");
    expect(circle?.kind).toBe("leaf");
    expect(rectNode?.kind).toBe("leaf");
    if (circle?.kind !== "leaf" || rectNode?.kind !== "leaf") return;
    expect(circle.width).toBe(circle.height);
    expect(rectNode.width > rectNode.height).toBe(true);
  });

  // A diamond's sloped sides shrink its usable area to the inscribed rhombus, so the label — and an
  // icon stacked above it — must satisfy contentW/w + contentH/h ≤ 1 or it pokes out the vertices.
  // Regression guard: a diamond used to be sized like a rect (label width × 40), clipping the label.
  it("grows a diamond so its label (and stacked icon) fit inside the inscribed rhombus", () => {
    const g = toElkGraph(
      {
        kind: "flowchart",
        direction: "TB",
        nodes: [
          { id: nid("P"), label: "Authorized?", shape: "diamond", icon: null },
          {
            id: nid("Q"),
            label: "Authorized?",
            shape: "diamond",
            icon: { pack: "devicon", name: "vault" },
          },
        ],
        edges: [],
        subgraphs: [],
        styles: [],
      },
      new Map(),
      heuristicMeasure,
    );
    const plain = g.children.find((c) => c.id === "P");
    const withIcon = g.children.find((c) => c.id === "Q");
    if (plain?.kind !== "leaf" || withIcon?.kind !== "leaf") throw new Error("not leaves");
    const labelW = heuristicMeasure("Authorized?");
    // Plain diamond: one 16px text line fits inside the rhombus with margin.
    expect(labelW / plain.width + 16 / plain.height).toBeLessThanOrEqual(1);
    // Icon diamond: the renderer's 40px icon-group (glyph 20 + gap 4 + text 16) must fit too, so it is
    // taller than the plain one.
    expect(labelW / withIcon.width + 40 / withIcon.height).toBeLessThanOrEqual(1);
    expect(withIcon.height).toBeGreaterThan(plain.height);
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
    edges: [{ id: eid("e0"), points: [{ x: 60, y: 20 }, { x: 100, y: 20 }], labelPos: null }],
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
