import { brand, point, rect, twoOrMore } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { TITLE_BAND, withTitle } from "../../src/core/title.js";

const scene: Scene = {
  nodes: [
    {
      id: brand<string, "SceneNodeId">("a"),
      bounds: rect(10, 20, 40, 30),
      label: "a",
      shape: "rect",
      parent: null,
      icon: null,
      rows: null,
      rowDivider: null,
      subtitle: null,
      accent: "none",
      role: "normal",
    },
  ],
  edges: [
    {
      id: brand<string, "SceneEdgeId">("e"),
      from: brand<string, "SceneNodeId">("a"),
      to: brand<string, "SceneNodeId">("a"),
      waypoints: twoOrMore(point(0, 0), point(10, 10)),
      label: "lbl",
      stroke: "solid",
      fromEnd: "none",
      toEnd: "none",
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos: point(5, 5),
      accent: "none",
    },
  ],
  wedges: [
    {
      center: point(50, 60),
      radius: 10,
      innerRadius: 0,
      startAngle: 0,
      endAngle: 1,
      label: "w",
      value: 1,
      percent: 100,
      colorIndex: 0,
    },
  ],
  decorations: [
    { kind: "band", bounds: rect(0, 0, 100, 10), fill: "section" },
    { kind: "rule", from: point(0, 0), to: point(0, 100) },
    { kind: "caption", at: point(4, 4), text: "c", align: "left" },
  ],
  extent: rect(0, 0, 200, 100),
};

describe("withTitle", () => {
  it("is the identity for a null title", () => {
    expect(withTitle(scene, null)).toBe(scene);
  });

  it("shifts every scene element down one title band and adds a centred title caption", () => {
    const out = withTitle(scene, "My chart");
    expect(out.nodes[0]?.bounds.origin.y).toBe(20 + TITLE_BAND);
    expect(out.nodes[0]?.bounds.origin.x).toBe(10);
    expect(out.edges[0]?.waypoints[0]).toEqual(point(0, TITLE_BAND));
    expect(out.edges[0]?.labelPos).toEqual(point(5, 5 + TITLE_BAND));
    expect(out.wedges[0]?.center).toEqual(point(50, 60 + TITLE_BAND));
    const [band, rule, caption, title] = out.decorations;
    expect(band?.kind === "band" && band.bounds.origin.y === TITLE_BAND).toBe(true);
    expect(rule?.kind === "rule" && rule.from.y === TITLE_BAND).toBe(true);
    expect(caption?.kind === "caption" && caption.at.y === 4 + TITLE_BAND).toBe(true);
    if (title?.kind !== "caption") throw new Error("missing title caption");
    expect(title.text).toBe("My chart");
    expect(title.align).toBe("center");
    expect(title.at).toEqual(point(100, TITLE_BAND / 2));
    expect(out.extent).toEqual(rect(0, 0, 200, 100 + TITLE_BAND));
  });
});
