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
      labelPos: null,
      accent: "none",
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

  it("prefers an edge over the container it runs through, but the container wins in empty space", () => {
    const leaf = (id: string, x: number, y: number) => ({
      id: snid(id),
      bounds: rect(x, y, 40, 30),
      label: id,
      shape: "rect" as const,
      parent: snid("G"),
      icon: null,
      rowDivider: null,
      subtitle: null,
      accent: "none" as const,
      role: "normal" as const,
      rows: null,
    });
    const grouped: Scene = {
      nodes: [
        {
          id: snid("G"),
          bounds: rect(0, 0, 300, 100),
          label: "group",
          shape: "container",
          parent: null,
          icon: null,
          rowDivider: null,
          subtitle: null,
          accent: "none",
          role: "normal",
          rows: null,
        },
        leaf("a", 10, 35),
        leaf("b", 250, 35),
      ],
      edges: [
        {
          id: seid("ab"),
          from: snid("a"),
          to: snid("b"),
          waypoints: [point(50, 50), point(250, 50)],
          label: null,
          stroke: "solid",
          fromEnd: "none",
          toEnd: "arrow",
          curved: false,
          fromLabel: null,
          toLabel: null,
          labelPos: null,
          accent: "none",
        },
      ],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 300, 100),
    };
    // On the edge, inside the container → the edge (this was unreachable before: the container won).
    expect(hitTest(grouped, point(150, 50))).toEqual({ kind: "edge", id: "ab" });
    // Inside the container but away from the edge → the container.
    expect(hitTest(grouped, point(150, 15))).toEqual({ kind: "node", id: "G" });
    // A leaf still beats everything.
    expect(hitTest(grouped, point(20, 50))).toEqual({ kind: "node", id: "a" });
  });
});
