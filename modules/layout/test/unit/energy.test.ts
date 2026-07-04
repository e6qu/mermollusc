import { brand, point, rect, twoOrMore } from "@m/std";
import type { Scene, SceneEdge, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { layoutEnergy, lowestEnergy } from "../../src/core/energy.js";
import {
  cardinalMountViolations,
  containersEncloseMembers,
  edgesUseCardinalMounts,
  noSiblingOverlaps,
  styleOk,
} from "../../src/core/invariants.js";

const node = (id: string, x: number, y: number, parent: string | null = null): SceneNode => ({
  id: brand<string, "SceneNodeId">(id),
  bounds: rect(x, y, 40, 30),
  label: id,
  shape: "rect",
  parent: parent === null ? null : brand<string, "SceneNodeId">(parent),
  icon: null,
  rows: null,
  rowDivider: null,
  subtitle: null,
  accent: "none",
  role: "normal",
});
const edge = (id: string, from: string, to: string, ...pts: [number, number][]): SceneEdge => {
  const [w0, w1, ...wr] = pts.map(([x, y]) => point(x, y));
  return {
  id: brand<string, "SceneEdgeId">(id),
  from: brand<string, "SceneNodeId">(from),
  to: brand<string, "SceneNodeId">(to),
  waypoints: twoOrMore(w0 ?? point(0, 0), w1 ?? point(0, 0), ...wr),
  label: null,
  stroke: "solid",
  fromEnd: "none",
  toEnd: "none",
  curved: false,
  fromLabel: null,
  toLabel: null,
  accent: "none" as const, labelPos: null,
  };
};
const scene = (nodes: SceneNode[], edges: SceneEdge[]): Scene => ({
  nodes,
  edges,
  wedges: [],
  decorations: [],
  extent: rect(0, 0, 500, 500),
});

describe("layoutEnergy", () => {
  it("counts a clean X crossing of two independent edges", () => {
    // edge a: (0,0)->(100,100); edge b: (0,100)->(100,0) — they cross once at (50,50)
    const e = layoutEnergy(
      scene(
        [node("p", 0, 0), node("q", 460, 460), node("r", 0, 460), node("s", 460, 0)],
        [edge("a", "p", "q", [0, 0], [100, 100]), edge("b", "r", "s", [0, 100], [100, 0])],
      ),
    );
    expect(e.crossings).toBe(1);
  });

  it("does not count two edges that merely share an endpoint node", () => {
    // both edges leave the same point — a fan, not a crossing
    const e = layoutEnergy(
      scene(
        [node("h", 0, 0), node("x", 200, 0), node("y", 200, 200)],
        [edge("a", "h", "x", [10, 10], [200, 10]), edge("b", "h", "y", [10, 10], [200, 210])],
      ),
    );
    expect(e.crossings).toBe(0);
  });

  it("flags an edge passing through an unrelated node's box", () => {
    // edge from p to q runs straight through the box of m at (40..80, 0..30)
    const e = layoutEnergy(
      scene(
        [node("p", 0, 0), node("q", 200, 0), node("m", 90, 0)],
        [edge("pq", "p", "q", [40, 15], [200, 15])],
      ),
    );
    expect(e.edgeNodeHits).toBe(1);
  });

  it("total weights a crossing far above a stray bend (so select prefers fewer crossings)", () => {
    const crossing = layoutEnergy(
      scene(
        [node("p", 0, 0), node("q", 460, 460), node("r", 0, 460), node("s", 460, 0)],
        [edge("a", "p", "q", [0, 0], [100, 100]), edge("b", "r", "s", [0, 100], [100, 0])],
      ),
    );
    const tidy = layoutEnergy(
      scene(
        [node("p", 0, 0), node("q", 460, 0)],
        [edge("a", "p", "q", [40, 15], [200, 15], [200, 60], [460, 60])], // 3 bends, no crossing
      ),
    );
    expect(tidy.total).toBeLessThan(crossing.total);
  });

  it("lowestEnergy picks the candidate with the fewest crossings, deterministically", () => {
    const crossed = scene(
      [node("p", 0, 0), node("q", 460, 460), node("r", 0, 460), node("s", 460, 0)],
      [edge("a", "p", "q", [0, 0], [100, 100]), edge("b", "r", "s", [0, 100], [100, 0])],
    );
    const clean = scene(
      [node("p", 0, 0), node("q", 460, 0)],
      [edge("a", "p", "q", [40, 15], [460, 15])],
    );
    expect(lowestEnergy([crossed, clean])).toBe(clean);
    expect(lowestEnergy([clean, crossed])).toBe(clean); // order-independent
  });
});

describe("style invariants", () => {
  it("noSiblingOverlaps rejects two overlapping top-level nodes", () => {
    expect(noSiblingOverlaps(scene([node("a", 0, 0), node("b", 200, 0)], []))).toBe(true);
    expect(noSiblingOverlaps(scene([node("a", 0, 0), node("b", 10, 0)], []))).toBe(false);
  });

  it("containersEncloseMembers requires a nested node inside its parent's box", () => {
    const parent: SceneNode = { ...node("box", 0, 0), bounds: rect(0, 0, 200, 200) };
    const inside = node("m", 20, 20, "box");
    const spilling = node("m", 190, 190, "box"); // pokes out the bottom-right
    expect(containersEncloseMembers(scene([parent, inside], []))).toBe(true);
    expect(containersEncloseMembers(scene([parent, spilling], []))).toBe(false);
  });

  it("styleOk combines both family-agnostic guards", () => {
    expect(styleOk(scene([node("a", 0, 0), node("b", 200, 0)], []))).toBe(true);
    expect(styleOk(scene([node("a", 0, 0), node("b", 10, 0)], []))).toBe(false);
  });

  it("edgesUseCardinalMounts rejects endpoints away from side centres", () => {
    const clean = scene(
      [node("a", 0, 0), node("b", 200, 0)],
      [edge("e", "a", "b", [40, 15], [200, 15])],
    );
    const cornerish = scene(
      [node("a", 0, 0), node("b", 200, 0)],
      [edge("e", "a", "b", [40, 5], [200, 15])],
    );
    expect(edgesUseCardinalMounts(clean)).toBe(true);
    expect(cardinalMountViolations(cornerish)).toEqual([
      {
        edgeId: brand<string, "SceneEdgeId">("e"),
        nodeId: brand<string, "SceneNodeId">("a"),
        end: "from",
        endpoint: point(40, 5),
      },
    ]);
  });
});
