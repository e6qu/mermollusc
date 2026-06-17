import { brand, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { edgeLabelAnchor, toDisplayList } from "../../src/core/display.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const scene: Scene = {
  nodes: [
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null },
    { id: snid("B"), bounds: rect(0, 80, 60, 40), label: "B", shape: "diamond", parent: null, icon: null },
  ],
  edges: [
    {
      id: seid("e0"),
      from: snid("A"),
      to: snid("B"),
      waypoints: [point(30, 40), point(30, 80)],
      label: "go",
      stroke: "solid",
      arrow: "filled",
    },
  ],
  extent: rect(0, 0, 60, 120),
};

describe("toDisplayList", () => {
  const cmds = toDisplayList(scene);

  it("emits a box for the rect node and a diamond for the diamond node", () => {
    expect(cmds.filter((c) => c.kind === "box")).toHaveLength(1);
    expect(cmds.filter((c) => c.kind === "diamond")).toHaveLength(1);
  });

  it("emits labels for nodes and for labeled edges", () => {
    const labels = cmds.filter((c) => c.kind === "label");
    expect(labels.map((l) => (l.kind === "label" ? l.text : ""))).toEqual(["A", "B", "go"]);
  });

  it("emits a polyline for the edge", () => {
    expect(cmds.filter((c) => c.kind === "polyline")).toHaveLength(1);
  });

  it("emits an icon command (with the ref) for a node that carries an icon", () => {
    const withIcon: Scene = {
      nodes: [
        {
          id: snid("S"),
          bounds: rect(0, 0, 80, 48),
          label: "Web",
          shape: "rect",
          parent: null,
          icon: { pack: "arch", name: "server" },
        },
      ],
      edges: [],
      extent: rect(0, 0, 80, 48),
    };
    const out = toDisplayList(withIcon);
    const icons = out.filter((c) => c.kind === "icon");
    expect(icons).toHaveLength(1);
    const icon = icons[0];
    expect(icon?.kind === "icon" ? icon.ref : null).toEqual({ pack: "arch", name: "server" });
  });

  it("anchors edge labels halfway along a routed polyline", () => {
    const anchor = edgeLabelAnchor([point(0, 0), point(100, 0), point(100, 100)]);
    expect(anchor.x).toBe(100);
    expect(anchor.y).toBe(11);
  });
});
