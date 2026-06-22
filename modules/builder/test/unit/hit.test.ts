import { brand, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { hitTest } from "../../src/core/hit.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const scene: Scene = {
  nodes: [
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
    { id: snid("B"), bounds: rect(0, 100, 60, 40), label: "B", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
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
      curved: false,
      fromLabel: null,
      toLabel: null,
    },
  ],
  wedges: [],
  decorations: [], extent: rect(0, 0, 60, 140),
};

describe("hitTest", () => {
  it("hits a node when the point is inside its bounds", () => {
    expect(hitTest(scene, point(30, 20))).toEqual({ kind: "node", id: "A" });
    expect(hitTest(scene, point(30, 120))).toEqual({ kind: "node", id: "B" });
  });

  it("hits an edge when the point is near a segment", () => {
    expect(hitTest(scene, point(32, 70))).toEqual({ kind: "edge", id: "e0" });
  });

  it("returns null in empty space", () => {
    expect(hitTest(scene, point(200, 200))).toBeNull();
  });

  it("prefers a node over a nearby edge", () => {
    expect(hitTest(scene, point(30, 38))).toEqual({ kind: "node", id: "A" });
  });
});
