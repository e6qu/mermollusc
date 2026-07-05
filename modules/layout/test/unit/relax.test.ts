import { describe, expect, it } from "vitest";
import { brand, point, rect } from "@m/std";
import type { Scene, SceneNode, SceneEdge } from "@m/contracts";
import { relaxScene } from "../../src/core/relax.js";

const nid = (s: string) => brand<string, "SceneNodeId">(s);
const eid = (s: string) => brand<string, "SceneEdgeId">(s);
const node = (id: string, x: number, y: number, parent: string | null = null): SceneNode => ({
  id: nid(id), bounds: rect(x, y, 60, 40), label: id, shape: "rect", parent: parent === null ? null : nid(parent),
  icon: null, rows: null, rowDivider: null, subtitle: null, accent: "none", role: "normal",
});
const edge = (id: string, from: string, to: string): SceneEdge => ({
  id: eid(id), from: nid(from), to: nid(to), waypoints: [point(0, 0), point(1, 1)],
  label: null, fromLabel: null, toLabel: null, labelPos: null, stroke: "solid", fromEnd: "none", toEnd: "arrow", curved: false, accent: "none",
});
const scene = (nodes: SceneNode[], edges: SceneEdge[]): Scene => ({
  nodes, edges, wedges: [], decorations: [], extent: rect(0, 0, 1000, 1000),
});

describe("relaxScene (force-directed relax)", () => {
  it("is deterministic — same input, same output", () => {
    const s = scene([node("a", 0, 0), node("b", 5, 5), node("c", 300, 300)], [edge("e", "a", "b")]);
    const r1 = relaxScene(s, new Set());
    const r2 = relaxScene(s, new Set());
    expect([...r1.entries()]).toEqual([...r2.entries()]);
  });
  it("separates two overlapping nodes (repulsion pushes them apart)", () => {
    const s = scene([node("a", 0, 0), node("b", 4, 0)], []);
    const r = relaxScene(s, new Set());
    const a = r.get(nid("a")) ?? { x: 0, y: 0 };
    const b = r.get(nid("b")) ?? { x: 4, y: 0 };
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(60);
  });
  it("holds a pinned node fixed and moves the rest around it", () => {
    const s = scene([node("a", 0, 0), node("b", 4, 0), node("c", 8, 0)], []);
    const r = relaxScene(s, new Set([nid("a")]));
    expect(r.has(nid("a"))).toBe(false); // pinned → not moved
    expect(r.size).toBeGreaterThan(0); // others moved
  });
  it("moves a container's descendants by the same delta (nesting preserved)", () => {
    const s = scene(
      [node("box", 0, 0), node("child", 5, 5, "box"), node("far", 400, 0)],
      [edge("e", "child", "far")],
    );
    const r = relaxScene(s, new Set());
    const box = r.get(nid("box"));
    const child = r.get(nid("child"));
    if (box !== undefined && child !== undefined) {
      // child keeps its +5,+5 offset from the box origin
      expect(child.x - box.x).toBeCloseTo(5, 4);
      expect(child.y - box.y).toBeCloseTo(5, 4);
    }
  });
});

// After relax, no two top-level boxes overlap (the force sim's box-resolution pass) — this is what was
// letting group/subgraph containers land on top of each other.
describe("relaxScene box-overlap resolution", () => {
  const boxesOverlap = (
    a: { x: number; y: number; hw: number; hh: number },
    b: { x: number; y: number; hw: number; hh: number },
  ) => Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.y - b.y) < a.hh + b.hh;

  it("leaves no overlapping node boxes for a clustered graph", () => {
    // six nodes all piled near the origin + a couple of edges
    const nodes = ["a", "b", "c", "d", "e", "f"].map((id, i) => node(id, (i % 2) * 6, i * 5));
    const s = scene(nodes, [edge("e1", "a", "b"), edge("e2", "c", "d"), edge("e3", "e", "f")]);
    const r = relaxScene(s, new Set());
    const centres = nodes.map((n) => {
      const p = r.get(n.id) ?? n.bounds.origin;
      return { x: p.x + 30, y: p.y + 20, hw: 30, hh: 20 };
    });
    for (let i = 0; i < centres.length; i++)
      for (let j = i + 1; j < centres.length; j++) {
        const a = centres[i];
        const b = centres[j];
        if (a && b) expect(boxesOverlap(a, b)).toBe(false);
      }
  });

  it("separates two overlapping group containers", () => {
    // two big containers (200x120) overlapping, each with a child; edges between children
    const big = (id: string, x: number, y: number): SceneNode => ({
      ...node(id, x, y),
      bounds: rect(x, y, 200, 120),
      shape: "container",
    });
    const s = scene(
      [big("G1", 0, 0), node("c1", 20, 20, "G1"), big("G2", 60, 30), node("c2", 80, 50, "G2")],
      [edge("e", "c1", "c2")],
    );
    const r = relaxScene(s, new Set());
    const g1 = r.get(nid("G1"));
    const g2 = r.get(nid("G2"));
    if (g1 !== undefined && g2 !== undefined) {
      const b1 = { x: g1.x + 100, y: g1.y + 60, hw: 100, hh: 60 };
      const b2 = { x: g2.x + 100, y: g2.y + 60, hw: 100, hh: 60 };
      expect(boxesOverlap(b1, b2)).toBe(false);
    }
  });
});
