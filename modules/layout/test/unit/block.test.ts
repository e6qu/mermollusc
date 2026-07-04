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
  styles: [],
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
      styles: [],
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
    // a→b is left-to-right on the same row: exit a's right-border mount, enter b's left-border mount,
    // not a diagonal centre-to-centre line or an arbitrary side/corner port.
    expect(edge.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(edge.waypoints[0]).toEqual({ x: a.origin.x + a.size.width, y: a.origin.y + 20 });
    expect(edge.waypoints[edge.waypoints.length - 1]).toEqual({ x: b.origin.x, y: b.origin.y + 20 });
    for (let i = 1; i < edge.waypoints.length; i++) {
      const prev = edge.waypoints[i - 1];
      const curr = edge.waypoints[i];
      if (prev === undefined || curr === undefined) throw new Error("missing waypoint");
      expect(prev.x === curr.x || prev.y === curr.y).toBe(true);
    }
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

describe("layoutBlock — spans, nesting, and the cycle guard", () => {
  it("a leaf with span N is N cells wide; a nested composite contains its child", () => {
    const ast: BlockAst = {
      kind: "block",
      columns: positiveInt(2),
      blocks: [
        { id: nid("h"), label: "H", shape: "rect", icon: null, span: positiveInt(2) },
        { id: nid("x"), label: "X", shape: "rect", icon: null, span: positiveInt(1) },
      ],
      groups: [
        { id: nid("g"), label: "G", columns: positiveInt(1), children: [nid("x")], span: positiveInt(1) },
      ],
      roots: [nid("h"), nid("g")],
      edges: [],
      styles: [],
    };
    const r = layoutBlock(ast, heuristicMeasure);
    if (!r.ok) throw new Error(r.error.message);
    const by = new Map<string, SceneNode>(r.value.nodes.map((n) => [n.id, n]));
    const h = by.get("h")?.bounds;
    const cell = by.get("x")?.bounds.size.width ?? 0;
    // span-2 leaf spans two cells + the gap between them (wider than a single cell).
    expect(h?.size.width).toBeGreaterThan(cell * 2);
    // x is nested: its box sits fully inside g's container box.
    const g = by.get("g")?.bounds;
    const x = by.get("x")?.bounds;
    expect(by.get("x")?.parent).toBe("g");
    if (g !== undefined && x !== undefined) {
      expect(x.origin.x).toBeGreaterThanOrEqual(g.origin.x);
      expect(x.origin.x + x.size.width).toBeLessThanOrEqual(g.origin.x + g.size.width + 0.01);
    }
  });

  it("fails loud (no stack overflow) on a cyclic child-in-two-groups tree", () => {
    // g1 contains g2, g2 contains g1 — a cycle a hand-built AST could express.
    const ast: BlockAst = {
      kind: "block",
      columns: positiveInt(1),
      blocks: [],
      groups: [
        { id: nid("g1"), label: "1", columns: positiveInt(1), children: [nid("g2")], span: positiveInt(1) },
        { id: nid("g2"), label: "2", columns: positiveInt(1), children: [nid("g1")], span: positiveInt(1) },
      ],
      roots: [nid("g1")],
      edges: [],
      styles: [],
    };
    expect(layoutBlock(ast, heuristicMeasure).ok).toBe(false);
  });
});
