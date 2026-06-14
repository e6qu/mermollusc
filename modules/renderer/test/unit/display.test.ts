import { brand, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { toDisplayList } from "../../src/core/display.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const scene: Scene = {
  nodes: [
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null },
    { id: snid("B"), bounds: rect(0, 80, 60, 40), label: "B", shape: "diamond", parent: null },
  ],
  edges: [
    { id: seid("e0"), from: snid("A"), to: snid("B"), waypoints: [point(30, 40), point(30, 80)], label: null },
  ],
  extent: rect(0, 0, 60, 120),
};

describe("toDisplayList", () => {
  const cmds = toDisplayList(scene);

  it("emits a box for the rect node and a diamond for the diamond node", () => {
    expect(cmds.filter((c) => c.kind === "box")).toHaveLength(1);
    expect(cmds.filter((c) => c.kind === "diamond")).toHaveLength(1);
  });

  it("emits a centered label per node", () => {
    const labels = cmds.filter((c) => c.kind === "label");
    expect(labels.map((l) => (l.kind === "label" ? l.text : ""))).toEqual(["A", "B"]);
  });

  it("emits a polyline for the edge", () => {
    expect(cmds.filter((c) => c.kind === "polyline")).toHaveLength(1);
  });
});
