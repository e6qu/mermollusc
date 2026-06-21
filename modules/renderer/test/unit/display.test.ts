import { brand, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { bezierControls, edgeLabelAnchor, toDisplayList } from "../../src/core/display.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const scene: Scene = {
  nodes: [
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none", rows: null },
    { id: snid("B"), bounds: rect(0, 80, 60, 40), label: "B", shape: "diamond", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none", rows: null },
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
      curved: false,
      fromLabel: null,
      toLabel: null,
    },
  ],
  wedges: [],
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

  it("layers edges under nodes, with edge labels on top", () => {
    const firstPolyline = cmds.findIndex((c) => c.kind === "polyline");
    const firstBox = cmds.findIndex((c) => c.kind === "box");
    const edgeLabel = cmds.findIndex((c) => c.kind === "label" && c.text === "go");
    // edge line drawn before the node box (so a node occludes a crossing link)...
    expect(firstPolyline).toBeGreaterThanOrEqual(0);
    expect(firstPolyline).toBeLessThan(firstBox);
    // ...and the edge label drawn after every node (so it stays readable on top).
    const lastNode = cmds.findLastIndex((c) => c.kind === "box" || c.kind === "diamond");
    expect(edgeLabel).toBeGreaterThan(lastNode);
  });

  it("plates edge labels (so the line can't strike through) but not node labels", () => {
    const byText = (t: string) => cmds.find((c) => c.kind === "label" && c.text === t);
    const edgeLabel = byText("go");
    const nodeLabel = byText("A");
    expect(edgeLabel?.kind === "label" ? edgeLabel.plate : null).toBe(true);
    expect(nodeLabel?.kind === "label" ? nodeLabel.plate : null).toBe(false);
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
      rowDivider: null, subtitle: null, accent: "none", rows: null,
        },
      ],
      edges: [],
      wedges: [],
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
          rowDivider: null, subtitle: null, accent: "none", rows: ["string name PK", "int age"],
        },
      ],
      edges: [],
      wedges: [],
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

  it("renders a class stereotype as a centred subtitle above the title, with a lowered divider", () => {
    const cls: Scene = {
      nodes: [
        {
          id: snid("Shape"),
          bounds: rect(0, 0, 120, 86),
          label: "Shape",
          shape: "rect",
          parent: null,
          icon: null,
          rowDivider: null,
          subtitle: "«interface»",
          accent: "none",
          rows: ["+draw() void"],
        },
      ],
      edges: [],
      wedges: [],
      extent: rect(0, 0, 120, 86),
    };
    const out = toDisplayList(cls);
    const labels = out.filter((c) => c.kind === "label");
    // Subtitle first (above), then the name, then the member row — all in document order.
    expect(labels.map((l) => (l.kind === "label" ? l.text : ""))).toEqual([
      "«interface»",
      "Shape",
      "+draw() void",
    ]);
    // The subtitle sits above the title; the title divider drops below the taller title band.
    const sub = labels[0];
    const title = labels[1];
    const divider = out.find((c) => c.kind === "polyline");
    const subY = sub?.kind === "label" ? sub.y : 0;
    const titleY = title?.kind === "label" ? title.y : 0;
    const divY = divider?.kind === "polyline" ? (divider.points[0]?.y ?? 0) : 0;
    expect(subY).toBeLessThan(titleY);
    expect(divY).toBeGreaterThan(titleY);
    // The title band is taller than a plain compartment box's 30px (subtitle adds 16).
    expect(divY).toBeGreaterThan(30);
  });

  it("turns each crow's-foot cardinality into its own marker geometry", () => {
    const ends = ["none", "arrow", "one", "zeroOrOne", "oneOrMany", "zeroOrMany"] as const;
    const markerOf = (end: (typeof ends)[number]) => {
      const s: Scene = {
        nodes: [
          { id: snid("A"), bounds: rect(0, 0, 40, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none", rows: null },
          { id: snid("B"), bounds: rect(0, 80, 40, 40), label: "B", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none", rows: null },
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
            curved: false,
            fromLabel: null,
            toLabel: null,
          },
        ],
        wedges: [],
        extent: rect(0, 0, 40, 120),
      };
      const poly = toDisplayList(s).find((c) => c.kind === "polyline");
      return poly?.kind === "polyline" ? poly.toMarker : null;
    };
    // none → nothing; arrow → a filled polygon; "one" → two bars; the optional cardinalities add a ring.
    expect(markerOf("none")).toEqual({ lines: [], polygons: [], circle: null });
    expect(markerOf("arrow")?.polygons).toHaveLength(1);
    expect(markerOf("arrow")?.polygons[0]?.fill).toBe("solid");
    expect(markerOf("one")?.lines).toHaveLength(2);
    expect(markerOf("zeroOrOne")?.circle).not.toBeNull();
    expect(markerOf("oneOrMany")?.lines.length).toBeGreaterThanOrEqual(3);
    expect(markerOf("zeroOrMany")?.circle).not.toBeNull();
    expect(markerOf("zeroOrMany")?.lines).toHaveLength(3);
  });

  it("draws UML class heads: hollow inheritance triangle, filled + hollow diamonds, open arrow", () => {
    const markerOf = (end: "triangle" | "diamondFilled" | "diamondHollow" | "arrowOpen") => {
      const s: Scene = {
        nodes: [
          { id: snid("A"), bounds: rect(0, 0, 40, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none", rows: null },
          { id: snid("B"), bounds: rect(0, 80, 40, 40), label: "B", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none", rows: null },
        ],
        edges: [
          {
            id: seid("e"),
            from: snid("A"),
            to: snid("B"),
            waypoints: [point(20, 40), point(20, 80)],
            label: null,
            stroke: "solid",
            fromEnd: end,
            toEnd: "none",
            curved: false,
            fromLabel: null,
            toLabel: null,
          },
        ],
        wedges: [],
        extent: rect(0, 0, 40, 120),
      };
      const poly = toDisplayList(s).find((c) => c.kind === "polyline");
      return poly?.kind === "polyline" ? poly.fromMarker : null;
    };
    expect(markerOf("triangle")?.polygons[0]?.fill).toBe("hollow");
    expect(markerOf("diamondFilled")?.polygons[0]?.fill).toBe("solid");
    expect(markerOf("diamondHollow")?.polygons[0]?.fill).toBe("hollow");
    expect(markerOf("diamondHollow")?.polygons[0]?.points).toHaveLength(4); // a rhombus
    // The open association arrow is two stroked segments (a V), no filled polygon.
    expect(markerOf("arrowOpen")?.polygons).toHaveLength(0);
    expect(markerOf("arrowOpen")?.lines).toHaveLength(2);
  });

  it("falls back to a stable marker direction for a degenerate (zero-length) edge", () => {
    const s: Scene = {
      nodes: [
        { id: snid("A"), bounds: rect(0, 0, 40, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none", rows: null },
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
          curved: false,
          fromLabel: null,
          toLabel: null,
        },
      ],
      wedges: [],
      extent: rect(0, 0, 40, 40),
    };
    const poly = toDisplayList(s).find((c) => c.kind === "polyline");
    const tri = poly?.kind === "polyline" ? (poly.toMarker.polygons[0]?.points ?? null) : null;
    expect(tri).not.toBeNull();
    // No NaN coordinates leak through from the zero-length segment.
    expect(tri?.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it("anchors edge labels halfway along a routed polyline", () => {
    const anchor = edgeLabelAnchor([point(0, 0), point(100, 0), point(100, 100)]);
    expect(anchor.x).toBe(100);
    expect(anchor.y).toBe(11);
  });

  it("places the label in a later segment when the midpoint is past the first", () => {
    // total 110, half 55: the first 10px segment is consumed, so the anchor lands in the long segment.
    const anchor = edgeLabelAnchor([point(0, 0), point(10, 0), point(110, 0)]);
    expect(anchor.x).toBe(55);
  });

  it("falls back to the first point for a degenerate (zero-length) polyline", () => {
    const anchor = edgeLabelAnchor([point(7, 9), point(7, 9)]);
    expect(anchor.x).toBe(7);
    expect(anchor.y).toBe(9);
  });

  it("passes the curved flag onto the polyline and emits per-end labels", () => {
    const s: Scene = {
      nodes: [],
      edges: [
        {
          id: seid("e0"),
          from: snid("A"),
          to: snid("B"),
          waypoints: [point(0, 0), point(100, 60)],
          label: null,
          stroke: "solid",
          fromEnd: "none",
          toEnd: "none",
          curved: true,
          fromLabel: "1",
          toLabel: "*",
        },
      ],
      wedges: [],
      extent: rect(0, 0, 120, 80),
    };
    const cmds = toDisplayList(s);
    const poly = cmds.find((c) => c.kind === "polyline");
    expect(poly?.kind === "polyline" ? poly.curved : false).toBe(true);
    const labels = cmds.filter((c) => c.kind === "label" && (c.text === "1" || c.text === "*"));
    expect(labels).toHaveLength(2);
  });

  it("emits a wedge command plus a percentage label for each pie slice", () => {
    const s: Scene = {
      nodes: [],
      edges: [],
      wedges: [
        {
          center: point(100, 100),
          radius: 80,
          startAngle: -Math.PI / 2,
          endAngle: Math.PI / 2,
          label: "Half",
          value: 50,
          percent: 50,
          colorIndex: 0,
        },
      ],
      extent: rect(0, 0, 200, 200),
    };
    const cmds = toDisplayList(s);
    const wedge = cmds.find((c) => c.kind === "wedge");
    const label = cmds.find((c) => c.kind === "label");
    expect(wedge?.kind === "wedge" ? wedge.colorIndex : -1).toBe(0);
    // A partial slice's on-slice label is just the percentage (centred); the name lives in the legend.
    expect(label?.kind === "label" ? label.text : "").toBe("50%");
    expect(label?.kind === "label" ? label.align : "").toBe("center");
  });

  it("renders a full-circle wedge as a legend swatch with its label to the right", () => {
    const s: Scene = {
      nodes: [],
      edges: [],
      wedges: [
        {
          center: point(50, 50),
          radius: 7,
          startAngle: 0,
          endAngle: Math.PI * 2,
          label: "Dogs  75",
          value: 75,
          percent: 75,
          colorIndex: 2,
        },
      ],
      extent: rect(0, 0, 200, 200),
    };
    const label = toDisplayList(s).find((c) => c.kind === "label");
    if (label?.kind !== "label") throw new Error("no label");
    // left-aligned, to the right of the swatch (centre.x + radius + gap), showing the full legend text
    expect(label.text).toBe("Dogs  75");
    expect(label.align).toBe("left");
    expect(label.x).toBeGreaterThan(50 + 7);
  });

  it("gives each node shape its corner radius (round/stadium/circle/container, rect = sharp)", () => {
    const radiusOf = (shape: "rect" | "round" | "stadium" | "circle" | "container"): number => {
      const s: Scene = {
        nodes: [
          {
            id: snid("N"),
            bounds: rect(0, 0, 80, 40),
            label: "N",
            shape,
            parent: null,
            icon: null,
            rowDivider: null,
            subtitle: null,
            accent: "none",
            rows: null,
          },
        ],
        edges: [],
        wedges: [],
        extent: rect(0, 0, 80, 40),
      };
      const box = toDisplayList(s).find((c) => c.kind === "box");
      return box?.kind === "box" ? box.radius : Number.NaN;
    };
    expect(radiusOf("rect")).toBe(0);
    expect(radiusOf("round")).toBe(8);
    expect(radiusOf("stadium")).toBe(20); // height / 2
    expect(radiusOf("circle")).toBe(20); // min(w, h) / 2
    expect(radiusOf("container")).toBe(4);
  });
});

describe("bezierControls", () => {
  it("bows along the dominant (horizontal) axis: control points share the endpoints' y", () => {
    const [c1, c2] = bezierControls(point(0, 0), point(100, 20));
    expect(c1).toEqual(point(50, 0));
    expect(c2).toEqual(point(50, 20));
  });

  it("bows along the dominant (vertical) axis: control points share the endpoints' x", () => {
    const [c1, c2] = bezierControls(point(0, 0), point(20, 100));
    expect(c1).toEqual(point(0, 50));
    expect(c2).toEqual(point(20, 50));
  });
});
