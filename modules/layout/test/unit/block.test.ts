import { brand, positiveInt } from "@m/std";
import type { BlockAst, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { layoutBlock } from "../../src/core/block.js";
import { heuristicMeasure } from "../../src/core/graph.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

const ast: BlockAst = {
  kind: "block",
  columns: positiveInt(2),
  blocks: [
    { id: nid("a"), label: "A", shape: "rect", icon: null, span: positiveInt(1) },
    { id: nid("b"), label: "B", shape: "rect", icon: null, span: positiveInt(1) },
    { id: nid("c"), label: "C", shape: "rect", icon: null, span: positiveInt(1) },
  ],
  groups: [],
  roots: [nid("a"), nid("b"), nid("c")],
  edges: [{ id: eid("e0"), from: nid("a"), to: nid("b"), kind: "arrow", label: null }],
};

describe("layoutBlock", () => {
  const result = layoutBlock(ast, heuristicMeasure);
  if (!result.ok) throw new Error(result.error.message);
  const scene = result.value;
  const byId = new Map<string, SceneNode>(scene.nodes.map((n) => [n.id, n]));

  it("fails loudly when an edge references an unknown block", () => {
    const bad: BlockAst = {
      kind: "block",
      columns: positiveInt(1),
      blocks: [{ id: nid("a"), label: "A", shape: "rect", icon: null, span: positiveInt(1) }],
      groups: [],
      roots: [nid("a")],
      edges: [{ id: eid("e0"), from: nid("a"), to: nid("ghost"), kind: "arrow", label: null }],
    };
    expect(layoutBlock(bad, heuristicMeasure).ok).toBe(false);
  });

  it("lays blocks out row-major across the given column count", () => {
    const a = byId.get("a")?.bounds;
    const b = byId.get("b")?.bounds;
    const c = byId.get("c")?.bounds;
    if (a === undefined || b === undefined || c === undefined) throw new Error("missing nodes");
    // a and b share a row; b is to the right of a.
    expect(a.origin.y).toBe(b.origin.y);
    expect(b.origin.x).toBeGreaterThan(a.origin.x);
    // c wraps to the next row, back at the first column.
    expect(c.origin.x).toBe(a.origin.x);
    expect(c.origin.y).toBeGreaterThan(a.origin.y);
  });

  it("routes an edge orthogonally between the two blocks' facing borders", () => {
    expect(scene.edges).toHaveLength(1);
    const edge = scene.edges[0];
    const a = byId.get("a")?.bounds;
    const b = byId.get("b")?.bounds;
    if (edge === undefined || a === undefined || b === undefined) throw new Error("missing");
    // a→b is left-to-right on the same row: exit a's right border, enter b's left border (4-point Z that
    // degenerates to a straight horizontal run here), not a diagonal centre-to-centre line.
    expect(edge.waypoints).toHaveLength(4);
    expect(edge.waypoints[0]).toEqual({ x: a.origin.x + a.size.width, y: a.origin.y + 20 });
    expect(edge.waypoints[edge.waypoints.length - 1]).toEqual({ x: b.origin.x, y: b.origin.y + 20 });
  });

  it("sizes the extent to the populated grid", () => {
    expect(scene.extent.size.width).toBeGreaterThan(0);
    expect(scene.extent.size.height).toBeGreaterThan(0);
  });

  it("honours an injected text measurer for node sizing", () => {
    const wideResult = layoutBlock(ast, (label) => label.length * 60);
    if (!wideResult.ok) throw new Error(wideResult.error.message);
    const a = wideResult.value.nodes.find((n) => n.id === "a")?.bounds.size.width;
    // 1-char label: heuristic cell = max(48, 8+24)=48; measured = max(48, 60+24)=84.
    expect(a).toBe(84);
    expect(scene.nodes.find((n) => n.id === "a")?.bounds.size.width).toBe(48);
  });
});
