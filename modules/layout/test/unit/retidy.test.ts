import { brand, point, rect, twoOrMore } from "@m/std";
import type { Point, TwoOrMore } from "@m/std";
import type { Scene, SceneEdge, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { retidyRoutes } from "../../src/core/route.js";

const nid = (s: string) => brand<string, "SceneNodeId">(s);
const eid = (s: string) => brand<string, "SceneEdgeId">(s);

const node = (id: string, x: number, y: number): SceneNode => ({
  id: nid(id),
  bounds: rect(x, y, 40, 24),
  label: id,
  shape: "rect",
  parent: null,
  icon: null,
  rows: null,
  rowDivider: null,
  subtitle: null,
  accent: "none",
  role: "normal",
});

const edge = (
  from: string,
  to: string,
  waypoints: TwoOrMore<Point>,
  curved = false,
): SceneEdge => ({
  id: eid(`${from}${to}`),
  from: nid(from),
  to: nid(to),
  waypoints,
  label: null,
  stroke: "solid",
  fromEnd: "none",
  toEnd: "arrow",
  curved,
  fromLabel: null,
  toLabel: null,
  accent: "none" as const, labelPos: null,
});

const scene = (nodes: readonly SceneNode[], edges: readonly SceneEdge[]): Scene => ({
  nodes,
  edges,
  wedges: [],
  decorations: [],
  extent: rect(0, 0, 400, 400),
});

// Every segment of a route is axis-aligned within tolerance.
const isOrthogonal = (wps: readonly Point[]): boolean =>
  wps.every(
    (p, i) => i === 0 || Math.abs(p.x - wps[i - 1]!.x) < 0.75 || Math.abs(p.y - wps[i - 1]!.y) < 0.75,
  );

describe("retidyRoutes", () => {
  it("re-routes a diagonal connector to a right-angle path between the boxes", () => {
    const s = scene(
      [node("A", 0, 0), node("B", 200, 160)],
      // A single diagonal segment from A's centre to B's centre — what a blended move leaves.
      [edge("A", "B", twoOrMore(point(20, 12), point(220, 172)))],
    );
    const out = retidyRoutes(s);
    expect(out).not.toBe(s); // a change happened
    const wps = out.edges[0]?.waypoints ?? [];
    expect(wps.length).toBeGreaterThanOrEqual(2);
    expect(isOrthogonal(wps)).toBe(true);
  });

  it("leaves an already-orthogonal route untouched (returns the same scene object)", () => {
    const s = scene(
      [node("A", 0, 0), node("B", 0, 160)],
      [edge("A", "B", twoOrMore(point(20, 24), point(20, 160)))],
    );
    expect(retidyRoutes(s)).toBe(s);
  });

  it("never touches an intentionally-curved edge, even when diagonal", () => {
    const s = scene(
      [node("A", 0, 0), node("B", 200, 160)],
      [edge("A", "B", twoOrMore(point(20, 12), point(220, 172)), true)],
    );
    expect(retidyRoutes(s)).toBe(s);
  });
});
