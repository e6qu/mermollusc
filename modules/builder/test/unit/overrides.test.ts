import { brand, point, rect } from "@m/std";
import type { LayoutOverrides, Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { applyOverrides, clearOverride, moveNode, resizeNode } from "../../src/core/overrides.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const scene: Scene = {
  nodes: [
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, rows: null },
    { id: snid("B"), bounds: rect(0, 100, 60, 40), label: "B", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, rows: null },
  ],
  edges: [
    {
      id: seid("e0"),
      from: snid("A"),
      to: snid("B"),
      waypoints: [point(30, 40), point(30, 100)],
      label: null,
      stroke: "solid",
      fromEnd: "none",
      toEnd: "arrow",
    },
  ],
  extent: rect(0, 0, 60, 140),
};

describe("overrides", () => {
  it("moveNode records a pinned position override", () => {
    const o = moveNode(new Map(), snid("A"), point(200, 50));
    const a = o.get(snid("A"));
    expect(a?.position).toEqual(point(200, 50));
    expect(a?.pinned).toBe(true);
  });

  it("resizeNode records a pinned position + size, and applyOverrides resizes the node", () => {
    const sz = rect(0, 0, 120, 80).size;
    const o = resizeNode(new Map(), snid("A"), point(10, 20), sz);
    const a = o.get(snid("A"));
    expect(a?.position).toEqual(point(10, 20));
    expect(a?.size).toEqual(sz);
    expect(a?.pinned).toBe(true);
    const shown = applyOverrides(scene, o);
    expect(shown.nodes[0]?.bounds.size).toEqual(sz);
  });

  it("applyOverrides repositions only the overridden node", () => {
    const o: LayoutOverrides = moveNode(new Map(), snid("A"), point(200, 50));
    const moved = applyOverrides(scene, o);
    expect(moved.nodes[0]?.bounds.origin).toEqual(point(200, 50));
    expect(moved.nodes[1]?.bounds.origin).toEqual(point(0, 100));
  });

  it("applyOverrides with no overrides returns the same scene", () => {
    expect(applyOverrides(scene, new Map())).toBe(scene);
  });

  it("re-anchors a boundary edge to the moved node's new border", () => {
    // Move only A → the A→B edge must re-anchor; its A end lands on A's new (left) border toward B.
    const moved = applyOverrides(scene, moveNode(new Map(), snid("A"), point(200, 50)));
    // A' = rect(200,50,60,40) centre (230,70); B centre (30,120) → border point on A' toward B.
    expect(moved.edges[0]?.waypoints).toEqual([point(200, 77.5), point(60, 112.5)]);
  });

  it("translates an edge whose endpoints both move by the same delta (group move)", () => {
    let o: LayoutOverrides = moveNode(new Map(), snid("A"), point(100, 10));
    o = moveNode(o, snid("B"), point(100, 110)); // both shifted by (+100, +10)
    const moved = applyOverrides(scene, o);
    // The route is preserved, just translated — not re-anchored to borders.
    expect(moved.edges[0]?.waypoints).toEqual([point(130, 50), point(130, 110)]);
  });

  it("clearOverride removes a node's override", () => {
    const o = moveNode(new Map(), snid("A"), point(200, 50));
    expect(clearOverride(o, snid("A")).has(snid("A"))).toBe(false);
  });
});
