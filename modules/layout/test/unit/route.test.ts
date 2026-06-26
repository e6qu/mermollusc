import { brand, point, rect, twoOrMore } from "@m/std";
import { describe, expect, it } from "vitest";
import { boxCenter, routeWaypoints, spreadPorts } from "../../src/core/route.js";

describe("routeWaypoints", () => {
  it("passes a full route through unchanged (≥2 points)", () => {
    const route = routeWaypoints(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      point(99, 99),
      point(88, 88),
    );
    expect(route).toEqual([point(0, 0), point(10, 0), point(10, 10)]);
  });

  it("falls back to a straight line between the endpoint centres for a degenerate (<2) route", () => {
    const fromC = point(5, 5);
    const toC = point(50, 5);
    expect(routeWaypoints([], fromC, toC)).toEqual([fromC, toC]);
    expect(routeWaypoints([{ x: 1, y: 1 }], fromC, toC)).toEqual([fromC, toC]);
  });
});

describe("boxCenter", () => {
  it("is the origin plus half the extent", () => {
    expect(boxCenter(10, 20, 40, 60)).toEqual(point(30, 50));
  });
});

describe("spreadPorts", () => {
  const node = (id: string, x: number, y: number) => ({
    id: brand<string, "SceneNodeId">(id),
    bounds: rect(x, y, 40, 30),
    label: id,
    shape: "rect" as const,
    parent: null,
    icon: null,
    rows: null,
    rowDivider: null,
    subtitle: null,
    accent: "none" as const,
    role: "normal" as const,
  });
  const edge = (id: string, from: string, to: string) => ({
    id: brand<string, "SceneEdgeId">(id),
    from: brand<string, "SceneNodeId">(from),
    to: brand<string, "SceneNodeId">(to),
    waypoints: twoOrMore(point(0, 0), point(1, 1)),
    label: null,
    stroke: "solid" as const,
    fromEnd: "none" as const,
    toEnd: "none" as const,
    curved: false,
    fromLabel: null,
    toLabel: null,
    labelPos: null,
  });

  it("gives edges sharing a node side distinct entry lanes (no two stack on the centre)", () => {
    // three sources to the left, one target on the right — all enter the target's LEFT side.
    const scene = {
      nodes: [node("a", 0, 0), node("b", 0, 100), node("c", 0, 200), node("t", 300, 100)],
      edges: [edge("e0", "a", "t"), edge("e1", "b", "t"), edge("e2", "c", "t")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 340, 230),
    };
    const out = spreadPorts(scene);
    // Each edge ends on the target's left side (x = 300) at a DISTINCT y — the lanes are spread.
    const entryYs = out.edges.map((e) => {
      const last = e.waypoints[e.waypoints.length - 1];
      return last?.y;
    });
    expect(new Set(entryYs).size).toBe(3); // three distinct lanes, not all on the centre
    for (const e of out.edges) {
      const last = e.waypoints[e.waypoints.length - 1];
      expect(last?.x).toBe(300); // all enter the left side of the target box
    }
  });

  // Reuse the energy module's geometry to assert "no leg passes through the obstacle box".
  const through = (a: { x: number; y: number }, b: { x: number; y: number }, box: ReturnType<typeof node>): boolean => {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const bx = box.bounds.origin.x;
    const by = box.bounds.origin.y;
    return x0 < bx + box.bounds.size.width && x1 > bx && y0 < by + box.bounds.size.height && y1 > by;
  };
  const routeHitsObstacle = (wp: readonly { x: number; y: number }[], box: ReturnType<typeof node>): boolean => {
    for (let i = 1; i < wp.length; i++) {
      const a = wp[i - 1];
      const b = wp[i];
      if (a !== undefined && b !== undefined && through(a, b, box)) return true;
    }
    return false;
  };

  it("reroutes around a node sitting directly on the straight A→B line (obstacle avoidance)", () => {
    // A and B are horizontally aligned; M sits squarely between them, on the direct line.
    const a = node("a", 0, 100);
    const m = node("m", 150, 100); // obstacle, dead centre between a (x0) and b (x300)
    const b = node("b", 300, 100);
    const scene = {
      nodes: [a, m, b],
      edges: [edge("e0", "a", "b")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 340, 200),
    };
    const out = spreadPorts(scene);
    const wp = out.edges[0]?.waypoints ?? [];
    // The straight route would gore M; the detour must clear it while still joining a → b.
    expect(routeHitsObstacle(wp, m)).toBe(false);
    expect(wp.length).toBeGreaterThanOrEqual(2);
  });

  it("leaves a self-loop / dangling edge untouched", () => {
    const scene = {
      nodes: [node("a", 0, 0)],
      edges: [edge("self", "a", "a"), edge("dangling", "a", "ghost")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 40, 30),
    };
    const out = spreadPorts(scene);
    expect(out.edges[0]?.waypoints).toEqual(scene.edges[0]?.waypoints);
    expect(out.edges[1]?.waypoints).toEqual(scene.edges[1]?.waypoints);
  });
});
