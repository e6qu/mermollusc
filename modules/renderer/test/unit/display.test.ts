import { brand, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { edgeLabelAnchor, toDisplayList } from "../../src/core/display.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const scene: Scene = {
  nodes: [
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null, rows: null },
    { id: snid("B"), bounds: rect(0, 80, 60, 40), label: "B", shape: "diamond", parent: null, icon: null, rows: null },
  ],
  edges: [
    {
      id: seid("e0"),
      from: snid("A"),
      to: snid("B"),
      waypoints: [point(30, 40), point(30, 80)],
      label: "go",
      stroke: "solid",
      fromEnd: "none",
      toEnd: "arrow",
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
      rows: null,
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

  it("renders an ER entity's compartment rows: title, divider, and left-aligned attribute rows", () => {
    const er: Scene = {
      nodes: [
        {
          id: snid("CUSTOMER"),
          bounds: rect(0, 0, 120, 70),
          label: "CUSTOMER",
          shape: "rect",
          parent: null,
          icon: null,
          rows: ["string name PK", "int age"],
        },
      ],
      edges: [],
      extent: rect(0, 0, 120, 70),
    };
    const out = toDisplayList(er);
    const labels = out.filter((c) => c.kind === "label");
    // Title is centred; the two attribute rows are left-aligned.
    expect(labels.map((l) => (l.kind === "label" ? `${l.text}:${l.align}` : ""))).toEqual([
      "CUSTOMER:center",
      "string name PK:left",
      "int age:left",
    ]);
    // One box plus exactly one divider polyline (markerless).
    expect(out.filter((c) => c.kind === "box")).toHaveLength(1);
    const lines = out.filter((c) => c.kind === "polyline");
    expect(lines).toHaveLength(1);
    const divider = lines[0];
    expect(divider?.kind === "polyline" ? divider.toMarker.lines : null).toEqual([]);
  });

  it("turns each crow's-foot cardinality into its own marker geometry", () => {
    const ends = ["none", "arrow", "one", "zeroOrOne", "oneOrMany", "zeroOrMany"] as const;
    const markerOf = (end: (typeof ends)[number]) => {
      const s: Scene = {
        nodes: [
          { id: snid("A"), bounds: rect(0, 0, 40, 40), label: "A", shape: "rect", parent: null, icon: null, rows: null },
          { id: snid("B"), bounds: rect(0, 80, 40, 40), label: "B", shape: "rect", parent: null, icon: null, rows: null },
        ],
        edges: [
          {
            id: seid("e"),
            from: snid("A"),
            to: snid("B"),
            waypoints: [point(20, 40), point(20, 80)],
            label: null,
            stroke: "solid",
            fromEnd: "none",
            toEnd: end,
          },
        ],
        extent: rect(0, 0, 40, 120),
      };
      const poly = toDisplayList(s).find((c) => c.kind === "polyline");
      return poly?.kind === "polyline" ? poly.toMarker : null;
    };
    // none → nothing; arrow → a filled triangle; "one" → two bars; the optional cardinalities add a ring.
    expect(markerOf("none")).toEqual({ lines: [], triangle: null, circle: null });
    expect(markerOf("arrow")?.triangle).not.toBeNull();
    expect(markerOf("one")?.lines).toHaveLength(2);
    expect(markerOf("zeroOrOne")?.circle).not.toBeNull();
    expect(markerOf("oneOrMany")?.lines.length).toBeGreaterThanOrEqual(3);
    expect(markerOf("zeroOrMany")?.circle).not.toBeNull();
    expect(markerOf("zeroOrMany")?.lines).toHaveLength(3);
  });

  it("falls back to a stable marker direction for a degenerate (zero-length) edge", () => {
    const s: Scene = {
      nodes: [
        { id: snid("A"), bounds: rect(0, 0, 40, 40), label: "A", shape: "rect", parent: null, icon: null, rows: null },
      ],
      edges: [
        {
          id: seid("e"),
          from: snid("A"),
          to: snid("A"),
          waypoints: [point(20, 20), point(20, 20)],
          label: null,
          stroke: "solid",
          fromEnd: "one",
          toEnd: "arrow",
        },
      ],
      extent: rect(0, 0, 40, 40),
    };
    const poly = toDisplayList(s).find((c) => c.kind === "polyline");
    const tri = poly?.kind === "polyline" ? poly.toMarker.triangle : null;
    expect(tri).not.toBeNull();
    // No NaN coordinates leak through from the zero-length segment.
    expect(tri?.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it("anchors edge labels halfway along a routed polyline", () => {
    const anchor = edgeLabelAnchor([point(0, 0), point(100, 0), point(100, 100)]);
    expect(anchor.x).toBe(100);
    expect(anchor.y).toBe(11);
  });
});
