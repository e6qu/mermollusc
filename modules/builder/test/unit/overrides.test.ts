import { brand, point, rect } from "@m/std";
import type { LayoutOverrides, Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { applyOverrides, clearOverride, moveNode } from "../../src/core/overrides.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const scene: Scene = {
  nodes: [
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null },
    { id: snid("B"), bounds: rect(0, 100, 60, 40), label: "B", shape: "rect", parent: null },
  ],
  edges: [
    {
      id: seid("e0"),
      from: snid("A"),
      to: snid("B"),
      waypoints: [point(30, 40), point(30, 100)],
      label: null,
      stroke: "solid",
      arrow: "filled",
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

  it("applyOverrides repositions only the overridden node", () => {
    const o: LayoutOverrides = moveNode(new Map(), snid("A"), point(200, 50));
    const moved = applyOverrides(scene, o);
    expect(moved.nodes[0]?.bounds.origin).toEqual(point(200, 50));
    expect(moved.nodes[1]?.bounds.origin).toEqual(point(0, 100));
  });

  it("applyOverrides with no overrides returns the same scene", () => {
    expect(applyOverrides(scene, new Map())).toBe(scene);
  });

  it("clearOverride removes a node's override", () => {
    const o = moveNode(new Map(), snid("A"), point(200, 50));
    expect(clearOverride(o, snid("A")).has(snid("A"))).toBe(false);
  });
});
