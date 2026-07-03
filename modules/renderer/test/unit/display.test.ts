import { brand, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import {
  bezierControls,
  edgeLabelAnchor,
  smoothSegments,
  roundedCorners,
  toDisplayList,
} from "../../src/core/display.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const scene: Scene = {
  nodes: [
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
    { id: snid("B"), bounds: rect(0, 80, 60, 40), label: "B", shape: "diamond", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
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
      labelPos: null,
    },
  ],
  wedges: [],
  decorations: [], extent: rect(0, 0, 60, 120),
};

describe("toDisplayList", () => {
  const cmds = toDisplayList(scene);

  it("emits a box for the rect node and a diamond for the diamond node", () => {
    expect(cmds.filter((c) => c.kind === "box")).toHaveLength(1);
    expect(cmds.filter((c) => c.kind === "diamond")).toHaveLength(1);
  });

  it("puts a direction chevron on interior legs of a directed edge (not the arrowhead leg), none when undirected", () => {
    const threeLeg = (toEnd: "none" | "arrow"): Scene => ({
      ...scene,
      edges: [
        {
          id: seid("e"),
          from: snid("A"),
          to: snid("B"),
          waypoints: [point(0, 0), point(100, 0), point(100, 100)],
          label: null,
          stroke: "solid",
          fromEnd: "none",
          toEnd,
          curved: false,
          fromLabel: null,
          toLabel: null,
          labelPos: null,
        },
      ],
    });
    const directed = toDisplayList(threeLeg("arrow")).find((c) => c.kind === "polyline");
    // Two legs, but the LAST leg carries the arrowhead — a chevron there reads as a doubled head, so
    // only the interior (first) leg gets one.
    expect(directed?.kind === "polyline" ? directed.midMarkers.length : -1).toBe(1);
    const undirected = toDisplayList(threeLeg("none")).find((c) => c.kind === "polyline");
    expect(undirected?.kind === "polyline" ? undirected.midMarkers.length : -1).toBe(0);
    // plainEdges (the classic/Mermaid-parity look) suppresses the chevrons even on directed edges.
    const plain = toDisplayList(threeLeg("arrow"), false, "plain").find((c) => c.kind === "polyline");
    expect(plain?.kind === "polyline" ? plain.midMarkers.length : -1).toBe(0);
  });

  it("a short single-segment directed edge gets NO mid-chevron (only its arrowhead — no double head)", () => {
    const oneLeg: Scene = {
      ...scene,
      edges: [
        {
          id: seid("e"),
          from: snid("A"),
          to: snid("B"),
          waypoints: [point(0, 0), point(200, 0)],
          label: null,
          stroke: "solid",
          fromEnd: "none",
          toEnd: "arrow",
          curved: false,
          fromLabel: null,
          toLabel: null,
          labelPos: null,
        },
      ],
    };
    const edge = toDisplayList(oneLeg).find((c) => c.kind === "polyline");
    expect(edge?.kind === "polyline" ? edge.midMarkers.length : -1).toBe(0);
  });

  it("collapses collinear waypoints, so a straight multi-point directed edge shows no chevron", () => {
    // Four collinear waypoints (a router's stub+lane legs on one straight run) reduce to a single leg,
    // which is the arrowhead leg — so no mid-chevron, just the head.
    const straightMulti: Scene = {
      ...scene,
      edges: [
        {
          id: seid("e"),
          from: snid("A"),
          to: snid("B"),
          waypoints: [point(0, 0), point(80, 0), point(160, 0), point(300, 0)],
          label: null,
          stroke: "solid",
          fromEnd: "none",
          toEnd: "arrow",
          curved: false,
          fromLabel: null,
          toLabel: null,
          labelPos: null,
        },
      ],
    };
    const edge = toDisplayList(straightMulti).find((c) => c.kind === "polyline");
    expect(edge?.kind === "polyline" ? edge.midMarkers.length : -1).toBe(0);
  });

  it("a BACKWARD directed multi-bend edge chevrons its interior legs, not the arrowhead (first) leg", () => {
    // fromEnd arrow → the head is at the START; a 3-leg route (4 corners) chevrons the two interior
    // legs and skips the first (which carries the head), pointing back toward the source.
    const backward: Scene = {
      ...scene,
      edges: [
        {
          id: seid("e"),
          from: snid("A"),
          to: snid("B"),
          waypoints: [point(0, 0), point(200, 0), point(200, 200), point(400, 200)],
          label: null,
          stroke: "solid",
          fromEnd: "arrow",
          toEnd: "none",
          curved: false,
          fromLabel: null,
          toLabel: null,
          labelPos: null,
        },
      ],
    };
    const edge = toDisplayList(backward).find((c) => c.kind === "polyline");
    expect(edge?.kind === "polyline" ? edge.midMarkers.length : -1).toBe(2);
  });

  it("plainEdges drops crossing hops: two crossing edges draw as straight lineTo paths", () => {
    // Crossing detection skips edges that share an endpoint, so the two edges connect disjoint pairs.
    const straight = (
      id: string,
      from: string,
      to: string,
      wp: Scene["edges"][number]["waypoints"],
    ) => ({
      id: seid(id),
      from: snid(from),
      to: snid(to),
      waypoints: wp,
      label: null,
      stroke: "solid" as const,
      fromEnd: "none" as const,
      toEnd: "arrow" as const,
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos: null,
    });
    const crossing: Scene = {
      ...scene,
      edges: [
        straight("h", "A", "B", [point(0, 50), point(100, 50)]),
        straight("v", "C", "D", [point(50, 0), point(50, 100)]),
      ],
    };
    // With decorations on, the later edge hops the earlier one (an arc appears in its path).
    const decorated = toDisplayList(crossing).filter((c) => c.kind === "polyline");
    const hasArc = decorated.some(
      (c) => c.kind === "polyline" && c.path.some((p) => p.kind === "quadTo" || p.kind === "cubicTo"),
    );
    expect(hasArc).toBe(true);
    // Plain (classic) edges never hop — every path segment stays a straight lineTo.
    const plain = toDisplayList(crossing, false, "plain").filter((c) => c.kind === "polyline");
    for (const c of plain) {
      if (c.kind !== "polyline") continue;
      for (const p of c.path) {
        expect(p.kind === "moveTo" || p.kind === "lineTo").toBe(true);
      }
    }
  });

  it("marks a bus junction where an edge branches off a backbone another continues along (opt-in only)", () => {
    const leg = (id: string, wp: Scene["edges"][number]["waypoints"]) => ({
      id: seid(id),
      from: snid("A"),
      to: snid("B"),
      waypoints: wp,
      label: null,
      stroke: "solid" as const,
      fromEnd: "none" as const,
      toEnd: "arrow" as const,
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos: null,
    });
    // Both run right along y=100; the first turns down at x=150 where the second keeps going → a junction.
    const busScene: Scene = {
      ...scene,
      edges: [
        leg("a", [point(0, 100), point(150, 100), point(150, 200)]),
        leg("b", [point(0, 100), point(200, 100), point(200, 200)]),
      ],
    };
    expect(toDisplayList(busScene, false).filter((c) => c.kind === "junction")).toHaveLength(0);
    const junctions = toDisplayList(busScene, true).filter((c) => c.kind === "junction");
    expect(junctions).toHaveLength(1);
    expect(junctions[0]?.kind === "junction" ? [junctions[0].cx, junctions[0].cy] : null).toEqual([
      150, 100,
    ]);
  });

  it("emits a stickman (actor) command plus a label for an actor-shaped node", () => {
    const actorScene: Scene = {
      ...scene,
      nodes: [
        {
          id: snid("dev"),
          bounds: rect(0, 0, 60, 50),
          label: "main",
          shape: "actor",
          parent: null,
          icon: null,
          rowDivider: null,
          subtitle: null,
          accent: "none",
          role: "normal",
          rows: null,
        },
      ],
      edges: [],
    };
    const out = toDisplayList(actorScene);
    expect(out.filter((c) => c.kind === "actor")).toHaveLength(1);
    expect(out.some((c) => c.kind === "label" && c.text === "main")).toBe(true);
  });

  it("emits labels for nodes and for labeled edges", () => {
    const labels = cmds.filter((c) => c.kind === "label");
    expect(labels.map((l) => (l.kind === "label" ? l.text : ""))).toEqual(["A", "B", "go"]);
  });

  it("emits a polyline for the edge", () => {
    expect(cmds.filter((c) => c.kind === "polyline")).toHaveLength(1);
  });

  it("renders state pseudo-node roles as semantic display commands", () => {
    const stateScene: Scene = {
      nodes: [
        { id: snid("start"), bounds: rect(0, 0, 20, 20), label: "", shape: "circle", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "stateStart", rows: null },
        { id: snid("end"), bounds: rect(40, 0, 20, 20), label: "", shape: "circle", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "stateEnd", rows: null },
        { id: snid("fork"), bounds: rect(80, 4, 48, 12), label: "", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "stateFork", rows: null },
        { id: snid("note"), bounds: rect(0, 40, 120, 44), label: "retry", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "stateNote", rows: null },
      ],
      edges: [],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 128, 84),
    };
    const out = toDisplayList(stateScene);
    expect(out.filter((c) => c.kind === "stateStart")).toHaveLength(1);
    expect(out.filter((c) => c.kind === "stateEnd")).toHaveLength(1);
    expect(out.filter((c) => c.kind === "stateBar")).toHaveLength(1);
    expect(out.filter((c) => c.kind === "polyline")).toHaveLength(1);
    expect(out.some((c) => c.kind === "label" && c.text === "retry")).toBe(true);
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

  it("marks edge labels as edge-style (not node) so they get the transparent/masked treatment", () => {
    const byText = (t: string) => cmds.find((c) => c.kind === "label" && c.text === t);
    const edgeLabel = byText("go");
    const nodeLabel = byText("A");
    // The base scene edge is vertical (30,40)->(30,80), so its label is masked (opaque plate in-channel).
    expect(edgeLabel?.kind === "label" ? edgeLabel.labelStyle : null).toBe("edge-masked");
    expect(nodeLabel?.kind === "label" ? nodeLabel.labelStyle : null).toBe("node");
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
      rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null,
        },
      ],
      edges: [],
      wedges: [],
      decorations: [], extent: rect(0, 0, 80, 48),
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
          rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: ["string name PK", "int age"],
        },
      ],
      edges: [],
      wedges: [],
      decorations: [], extent: rect(0, 0, 120, 70),
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
      role: "normal",
          rows: ["+draw() void"],
        },
      ],
      edges: [],
      wedges: [],
      decorations: [], extent: rect(0, 0, 120, 86),
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
          { id: snid("A"), bounds: rect(0, 0, 40, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
          { id: snid("B"), bounds: rect(0, 80, 40, 40), label: "B", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
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
            labelPos: null,
          },
        ],
        wedges: [],
        decorations: [], extent: rect(0, 0, 40, 120),
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
          { id: snid("A"), bounds: rect(0, 0, 40, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
          { id: snid("B"), bounds: rect(0, 80, 40, 40), label: "B", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
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
            labelPos: null,
          },
        ],
        wedges: [],
        decorations: [], extent: rect(0, 0, 40, 120),
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
        { id: snid("A"), bounds: rect(0, 0, 40, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
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
          labelPos: null,
        },
      ],
      wedges: [],
      decorations: [], extent: rect(0, 0, 40, 40),
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
          labelPos: null,
        },
      ],
      wedges: [],
      decorations: [], extent: rect(0, 0, 120, 80),
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
          innerRadius: 0,
          startAngle: -Math.PI / 2,
          endAngle: Math.PI / 2,
          label: "Half",
          value: 50,
          percent: 50,
          colorIndex: 0,
        },
      ],
      decorations: [], extent: rect(0, 0, 200, 200),
    };
    const cmds = toDisplayList(s);
    const wedge = cmds.find((c) => c.kind === "wedge");
    const label = cmds.find((c) => c.kind === "label");
    expect(wedge?.kind === "wedge" ? wedge.colorIndex : -1).toBe(0);
    expect(wedge?.kind === "wedge" ? wedge.innerRadius : -1).toBe(0);
    // A partial slice's on-slice label is just the percentage (centred); the name lives in the legend.
    expect(label?.kind === "label" ? label.text : "").toBe("50%");
    expect(label?.kind === "label" ? label.align : "").toBe("center");
  });

  it("passes a donut slice's inner radius into the wedge command", () => {
    const s: Scene = {
      nodes: [],
      edges: [],
      wedges: [
        {
          center: point(100, 100),
          radius: 80,
          innerRadius: 36,
          startAngle: -Math.PI / 2,
          endAngle: Math.PI / 2,
          label: "Half",
          value: 50,
          percent: 50,
          colorIndex: 0,
        },
      ],
      decorations: [],
      extent: rect(0, 0, 200, 200),
    };
    const wedge = toDisplayList(s).find((c) => c.kind === "wedge");
    expect(wedge?.kind === "wedge" ? wedge.innerRadius : -1).toBe(36);
  });

  it("renders a full-circle wedge as a legend swatch with its label to the right", () => {
    const s: Scene = {
      nodes: [],
      edges: [],
      wedges: [
        {
          center: point(50, 50),
          radius: 7,
          innerRadius: 0,
          startAngle: 0,
          endAngle: Math.PI * 2,
          label: "Dogs  75",
          value: 75,
          percent: 75,
          colorIndex: 2,
        },
      ],
      decorations: [], extent: rect(0, 0, 200, 200),
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
      role: "normal",
            rows: null,
          },
        ],
        edges: [],
        wedges: [],
        decorations: [], extent: rect(0, 0, 80, 40),
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

describe("decorations", () => {
  it("renders a `rule` as a dashed markerless polyline and a `caption` as a plain label, behind content", () => {
    const s: Scene = {
      nodes: [
        {
          id: snid("A"),
          bounds: rect(40, 40, 60, 22),
          label: "A",
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
      edges: [],
      wedges: [],
      decorations: [
        { kind: "rule", from: point(20, 0), to: point(20, 80) },
        { kind: "caption", at: point(8, 10), text: "2024-01-01", align: "left" },
      ],
      extent: rect(0, 0, 120, 80),
    };
    const cmds = toDisplayList(s);
    // the rule is a dashed polyline with no end markers; the caption a plateless label
    const rule = cmds.find((c) => c.kind === "polyline");
    expect(rule?.kind === "polyline" ? rule.dashed : false).toBe(true);
    expect(rule?.kind === "polyline" ? rule.toMarker.lines : null).toEqual([]);
    const caption = cmds.find((c) => c.kind === "label" && c.text === "2024-01-01");
    expect(caption?.kind === "label" ? caption.labelStyle : "edge").toBe("node");
    // decorations draw first (behind the node box)
    expect(cmds.findIndex((c) => c.kind === "polyline")).toBeLessThan(
      cmds.findIndex((c) => c.kind === "box"),
    );
  });

  it("renders a `band` as a filled background rect carrying its fill, behind content", () => {
    const s: Scene = {
      nodes: [
        {
          id: snid("A"),
          bounds: rect(40, 40, 60, 22),
          label: "A",
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
      edges: [],
      wedges: [],
      decorations: [{ kind: "band", bounds: rect(0, 30, 120, 30), fill: "section" }],
      extent: rect(0, 0, 120, 80),
    };
    const cmds = toDisplayList(s);
    const band = cmds.find((c) => c.kind === "band");
    expect(band?.kind === "band" ? band.fill : null).toBe("section");
    expect(band?.kind === "band" ? [band.x, band.y, band.width, band.height] : []).toEqual([0, 30, 120, 30]);
    // the band draws before (behind) the node box
    expect(cmds.findIndex((c) => c.kind === "band")).toBeLessThan(cmds.findIndex((c) => c.kind === "box"));
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

describe("smoothSegments", () => {
  it("yields one bezier segment per gap, each ending exactly on its waypoint", () => {
    const pts = [point(0, 0), point(10, 10), point(20, 0)];
    const segs = smoothSegments(pts);
    expect(segs).toHaveLength(2);
    expect(segs[0]?.to).toEqual(point(10, 10));
    expect(segs[1]?.to).toEqual(point(20, 0)); // ends on the last waypoint → arrowhead stays put
  });
  it("keeps a straight collinear run straight (control points stay on the line)", () => {
    const segs = smoothSegments([point(0, 0), point(10, 0), point(20, 0)]);
    for (const s of segs) {
      expect(s.c1.y).toBe(0);
      expect(s.c2.y).toBe(0);
    }
  });
  it("is empty for a single point and one segment for a pair", () => {
    expect(smoothSegments([point(0, 0)])).toHaveLength(0);
    expect(smoothSegments([point(0, 0), point(5, 5)])).toHaveLength(1);
  });
});

describe("roundedCorners", () => {
  it("rounds only at interior corners: straight legs, a quad arc per bend, exact endpoints", () => {
    // a 4-point Z: two interior corners → each becomes (line to entry, quad around corner)
    const z = [point(0, 0), point(50, 0), point(50, 40), point(100, 40)];
    const ops = roundedCorners(z, 9);
    // last op lands exactly on the final waypoint (arrowhead stays put)
    expect(ops[ops.length - 1]?.to).toEqual(point(100, 40));
    // there is at least one quadratic (a rounded corner) and at least one straight leg
    expect(ops.some((o) => o.ctrl !== null)).toBe(true);
    expect(ops.some((o) => o.ctrl === null)).toBe(true);
    // the quad control points are the original corners (the curve is AT the bend)
    const ctrls = ops.flatMap((o) => (o.ctrl === null ? [] : [o.ctrl]));
    expect(ctrls).toContainEqual(point(50, 0));
    expect(ctrls).toContainEqual(point(50, 40));
  });
  it("keeps a 2-point edge a single straight line (no corner to round)", () => {
    const ops = roundedCorners([point(0, 0), point(20, 20)], 9);
    expect(ops).toEqual([{ ctrl: null, to: point(20, 20) }]);
  });
  it("clamps the radius to half the shorter adjacent leg (a tight dog-leg stays clean)", () => {
    // legs of length 4 → radius clamps to 2, so the arc never overshoots
    const ops = roundedCorners([point(0, 0), point(4, 0), point(4, 4)], 9);
    const quad = ops.find((o) => o.ctrl !== null);
    expect(quad?.ctrl).toEqual(point(4, 0));
  });
  it("detects edge crossings and generates crossing hops on horizontal segments", () => {
    const crossoverScene: Scene = {
      nodes: [],
      edges: [
        {
          id: seid("e1"),
          from: snid("n1"),
          to: snid("n2"),
          waypoints: [point(0, 20), point(40, 20)],
          stroke: "solid",
          fromEnd: "none",
          toEnd: "arrow",
          fromLabel: null,
          toLabel: null,
          label: null,
          labelPos: null,
          curved: false,
        },
        {
          id: seid("e2"),
          from: snid("n3"),
          to: snid("n4"),
          waypoints: [point(20, 0), point(20, 40)],
          stroke: "solid",
          fromEnd: "none",
          toEnd: "arrow",
          fromLabel: null,
          toLabel: null,
          label: null,
          labelPos: null,
          curved: false,
        },
      ],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 100, 100),
    };
    const out = toDisplayList(crossoverScene);
    const polylines = out.filter((c) => c.kind === "polyline");
    expect(polylines).toHaveLength(2);

    const horizontalEdgeCmd = polylines.find((p) => p.kind === "polyline" && p.points[0]?.y === 20);
    const verticalEdgeCmd = polylines.find((p) => p.kind === "polyline" && p.points[0]?.x === 20);

    expect(horizontalEdgeCmd).toBeDefined();
    expect(verticalEdgeCmd).toBeDefined();

    if (horizontalEdgeCmd?.kind === "polyline") {
      const pathKinds = horizontalEdgeCmd.path.map((p) => p.kind);
      expect(pathKinds).toContain("quadTo");
    }

    if (verticalEdgeCmd?.kind === "polyline") {
      const pathKinds = verticalEdgeCmd.path.map((p) => p.kind);
      expect(pathKinds).not.toContain("quadTo");
    }
  });
});

describe("spline edge finish", () => {
  const bent: Scene = {
    ...scene,
    edges: [
      {
        id: seid("e"),
        from: snid("A"),
        to: snid("B"),
        waypoints: [point(0, 0), point(100, 0), point(100, 100)],
        label: null,
        stroke: "solid",
        fromEnd: "none",
        toEnd: "arrow",
        curved: false,
        fromLabel: null,
        toLabel: null,
        labelPos: null,
      },
    ],
  };

  it("spline rounds the interior corner but keeps straight (perpendicular) endpoint segments", () => {
    const edge = toDisplayList(bent, false, "spline").find((c) => c.kind === "polyline");
    if (edge?.kind !== "polyline") throw new Error("no polyline");
    expect(edge.midMarkers).toEqual([]);
    // Rounded-corner orthogonal: the corner becomes a quad, but the path starts at the exact endpoint
    // and ends at the exact endpoint — so the edge enters/leaves nodes straight and on-centre.
    const kinds = edge.path.map((p) => p.kind);
    expect(kinds[0]).toBe("moveTo");
    expect(kinds).toContain("quadTo"); // the rounded corner
    const first = edge.path[0];
    const last = edge.path[edge.path.length - 1];
    if (first === undefined || last === undefined) throw new Error("empty path");
    expect([first.x, first.y]).toEqual([0, 0]);
    expect([last.x, last.y]).toEqual([100, 100]);
  });

  it("a straight (axis-aligned) 2-point edge stays visually straight under spline", () => {
    const straightScene: Scene = { ...scene }; // base scene edge is (30,40)->(30,80), vertical
    const edge = toDisplayList(straightScene, false, "spline").find((c) => c.kind === "polyline");
    if (edge?.kind !== "polyline") throw new Error("no polyline");
    // A 2-point edge renders as one cubic with control points collinear on the shared axis (x=30) —
    // visually a straight vertical line, never a bow.
    const tail = edge.path[edge.path.length - 1];
    if (tail === undefined || tail.kind !== "cubicTo") throw new Error("no cubic tail");
    expect([tail.c1x, tail.c2x, tail.x]).toEqual([30, 30, 30]);
  });
});
