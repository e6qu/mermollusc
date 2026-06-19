import { brand } from "@m/std";
import type { MindmapAst, MindmapNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutMindmap } from "../../src/core/mindmap.js";

const nid = (s: string) => brand<string, "MindmapNodeId">(s);

const mk = (
  id: string,
  parent: string | null,
  level: number,
  shape: MindmapNode["shape"] = "default",
): MindmapNode => ({ id: nid(id), label: id, shape, parent: parent === null ? null : nid(parent), level });

// root → { a → {a1, a2}, b }
const ast: MindmapAst = {
  kind: "mindmap",
  nodes: [
    mk("root", null, 0, "circle"),
    mk("a", "root", 1),
    mk("a1", "a", 2),
    mk("a2", "a", 2),
    mk("b", "root", 1, "square"),
  ],
};

describe("layoutMindmap", () => {
  const result = layoutMindmap(ast, heuristicMeasure);
  if (!result.ok) throw new Error(result.error.message);
  const scene = result.value;
  const node = (id: string) => scene.nodes.find((n) => n.id === id);
  const center = (id: string) => {
    const b = node(id)?.bounds;
    return b === undefined ? { x: 0, y: 0 } : { x: b.origin.x + b.size.width / 2, y: b.origin.y + b.size.height / 2 };
  };
  const dist = (a: string, b: string) => Math.hypot(center(a).x - center(b).x, center(a).y - center(b).y);

  it("emits a node per mindmap node and an arrowless edge per parent link", () => {
    expect(scene.nodes.map((n) => n.id).sort()).toEqual(["a", "a1", "a2", "b", "root"]);
    expect(scene.edges).toHaveLength(4);
    expect(scene.edges.every((e) => e.toEnd === "none" && e.fromEnd === "none")).toBe(true);
    expect(node("root")?.shape).toBe("circle");
    expect(node("b")?.shape).toBe("rect");
  });

  it("places deeper nodes farther from the root (radius grows with depth)", () => {
    // root is the centre; a (depth 1) is one ring out; a1 (depth 2) is farther still.
    const rootToA = dist("root", "a");
    const rootToA1 = dist("root", "a1");
    expect(rootToA).toBeGreaterThan(100);
    expect(rootToA1).toBeGreaterThan(rootToA);
  });

  it("separates sibling subtrees into distinct angular sectors", () => {
    // a and b are on opposite-ish sides of the root, so they're well apart.
    expect(dist("a", "b")).toBeGreaterThan(100);
  });

  it("rings the roots around a virtual hub for a multi-root forest", () => {
    const forest: MindmapAst = {
      kind: "mindmap",
      nodes: [mk("r1", null, 0), mk("r2", null, 0), mk("c", "r1", 1)],
    };
    const laid = layoutMindmap(forest, heuristicMeasure);
    if (!laid.ok) throw new Error(laid.error.message);
    // Both roots are pushed off-centre (depth+1), so neither sits at the exact same spot.
    const r1 = laid.value.nodes.find((n) => n.id === "r1")?.bounds.origin;
    const r2 = laid.value.nodes.find((n) => n.id === "r2")?.bounds.origin;
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r1?.x !== r2?.x || r1?.y !== r2?.y).toBe(true);
  });

  it("returns a valid empty scene for a node-less mindmap", () => {
    const empty = layoutMindmap({ kind: "mindmap", nodes: [] }, heuristicMeasure);
    if (!empty.ok) throw new Error(empty.error.message);
    expect(empty.value.nodes).toHaveLength(0);
    expect(empty.value.extent.size.width).toBeGreaterThan(0);
  });
});
