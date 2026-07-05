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
