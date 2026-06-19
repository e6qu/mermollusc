import { brand, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { toDisplayList } from "../../src/core/display.js";
import { defaultTheme } from "../../src/shell/paint.js";
import { toSvg } from "../../src/shell/svg.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const scene: Scene = {
  nodes: [
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A < B", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, rows: null },
    { id: snid("B"), bounds: rect(0, 80, 60, 40), label: "B", shape: "diamond", parent: null, icon: null, rowDivider: null, subtitle: null, rows: null },
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

describe("toSvg", () => {
  const svg = toSvg(toDisplayList(scene), {
    width: 108,
    height: 168,
    origin: { x: 0, y: 0 },
    margin: 24,
    theme: defaultTheme,
    icons: new Map(),
  });

  it("produces a well-formed SVG document with the theme background", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain(`fill="${defaultTheme.background}"`);
    expect(svg).toContain('viewBox="0 0 108 168"');
  });

  it("offsets the draw group by `margin − origin` so negative-coordinate content isn't clipped", () => {
    const shifted = toSvg(toDisplayList(scene), {
      width: 108,
      height: 168,
      origin: { x: 10, y: 20 },
      margin: 24,
      theme: defaultTheme,
      icons: new Map(),
    });
    expect(shifted).toContain('transform="translate(14,4)"'); // 24−10, 24−20
  });

  it("maps each shape kind to its SVG element", () => {
    expect(svg).toContain("<rect"); // the rect node (+ background)
    expect(svg).toContain("<polygon"); // the diamond node
    expect(svg).toContain("<polyline"); // the edge
    expect(svg).toContain(`<polygon points`); // the diamond and the filled arrowhead
    expect(svg).toContain(`fill="${defaultTheme.stroke}"`); // the arrowhead is filled with the stroke colour
    expect(svg).toContain("<text"); // labels
  });

  it("escapes label text", () => {
    expect(svg).toContain("A &lt; B");
    expect(svg).not.toContain("A < B");
  });

  it("emits ER crow's-foot markers and left-aligned attribute rows", () => {
    const er: Scene = {
      nodes: [
        { id: snid("A"), bounds: rect(0, 0, 120, 50), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, rows: ["int id PK"] },
        { id: snid("B"), bounds: rect(0, 100, 60, 40), label: "B", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, rows: null },
      ],
      edges: [
        {
          id: seid("e0"),
          from: snid("A"),
          to: snid("B"),
          waypoints: [point(30, 50), point(30, 100)],
          label: null,
          stroke: "solid",
          fromEnd: "one",
          toEnd: "zeroOrMany",
        },
      ],
      extent: rect(0, 0, 120, 140),
    };
    const out = toSvg(toDisplayList(er), { width: 120, height: 140, origin: { x: 0, y: 0 },
 margin: 0, theme: defaultTheme, icons: new Map() });
    // The "many" prongs are <line>s; the "zero" ring is a <circle>; the attribute row is start-anchored.
    expect(out).toContain("<line");
    expect(out).toContain("<circle");
    expect(out).toMatch(/text-anchor="start"[^>]*>.*int id PK/);
    // No leftover <marker>/marker-end machinery — markers are explicit geometry now.
    expect(out).not.toContain("marker-end");
    expect(out).not.toContain("<marker");
  });

  it("renders a UML class diagram: hollow inheritance triangle + field/method divider", () => {
    const cls: Scene = {
      nodes: [
        {
          id: snid("Animal"),
          bounds: rect(0, 0, 120, 70),
          label: "Animal",
          shape: "rect",
          parent: null,
          icon: null,
          rowDivider: 1, subtitle: null,
          rows: ["+int age", "+move() void"],
        },
        {
          id: snid("Duck"),
          bounds: rect(0, 120, 100, 30),
          label: "Duck",
          shape: "rect",
          parent: null,
          icon: null,
          rowDivider: null, subtitle: null,
          rows: null,
        },
      ],
      edges: [
        {
          id: seid("e0"),
          from: snid("Animal"),
          to: snid("Duck"),
          waypoints: [point(60, 70), point(60, 120)],
          label: null,
          stroke: "solid",
          fromEnd: "triangle",
          toEnd: "none",
        },
      ],
      extent: rect(0, 0, 120, 150),
    };
    const out = toSvg(toDisplayList(cls), {
      width: 120,
      height: 150,
      origin: { x: 0, y: 0 },
      margin: 0,
      theme: defaultTheme,
      icons: new Map(),
    });
    // The hollow inheritance head is a background-filled, stroked polygon (not a solid stroke fill).
    expect(out).toMatch(
      new RegExp(`<polygon points="[^"]*" fill="${defaultTheme.background}" stroke="${defaultTheme.stroke}"`),
    );
    // Title divider + inner field/method divider → at least two markerless <polyline>s.
    expect((out.match(/<polyline/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(out).toContain(">+int age</tspan>");
  });

  it("renders a multi-line label as stacked <tspan>s", () => {
    const ml: Scene = {
      nodes: [
        { id: snid("C"), bounds: rect(0, 0, 90, 56), label: "API\nHandles", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, rows: null },
      ],
      edges: [],
      extent: rect(0, 0, 90, 56),
    };
    const out = toSvg(toDisplayList(ml), { width: 90, height: 56, origin: { x: 0, y: 0 },
 margin: 0, theme: defaultTheme, icons: new Map() });
    expect(out.match(/<tspan/g)?.length).toBe(2);
    expect(out).toContain(">API</tspan>");
    // The continuation line is dimmed + smaller; the primary line is not styled down.
    expect(out).toMatch(/font-size="[\d.]+" fill-opacity="0.7">Handles<\/tspan>/);
    expect(out).not.toMatch(/fill-opacity="0.7">API/);
  });

  it("emits an <image> for a node icon when an href is supplied", () => {
    const iconScene: Scene = {
      nodes: [
        {
          id: snid("S"),
          bounds: rect(0, 0, 60, 40),
          label: "S",
          shape: "rect",
          parent: null,
          icon: { pack: "p", name: "n" },
          rowDivider: null, subtitle: null, rows: null,
        },
      ],
      edges: [],
      extent: rect(0, 0, 60, 40),
    };
    const withIcon = toSvg(toDisplayList(iconScene), {
      width: 108,
      height: 88,
      origin: { x: 0, y: 0 },
      margin: 24,
      theme: defaultTheme,
      icons: new Map([["p/n", "data:image/svg+xml,<svg/>"]]),
    });
    expect(withIcon).toContain("<image");
    expect(withIcon).toContain("p/n".length > 0 ? "href=" : "");
  });
});
