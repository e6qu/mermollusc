import { brand, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { toDisplayList } from "../../src/core/display.js";
import { type Canvas2D, defaultTheme, paint, type Theme } from "../../src/shell/paint.js";

class RecordingCtx implements Canvas2D {
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  strokeStyle: string | CanvasGradient | CanvasPattern = "";
  lineWidth = 0;
  globalAlpha = 1;
  font = "";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly calls: string[] = [];
  readonly fillTextFonts: string[] = [];
  beginPath(): void {
    this.calls.push("beginPath");
  }
  moveTo(): void {
    this.calls.push("moveTo");
  }
  lineTo(): void {
    this.calls.push("lineTo");
  }
  closePath(): void {
    this.calls.push("closePath");
  }
  stroke(): void {
    this.calls.push("stroke");
  }
  fill(): void {
    this.calls.push("fill");
  }
  fillText(text: string): void {
    this.calls.push(`fillText:${text}`);
    this.fillTextFonts.push(this.font);
  }
  roundRect(): void {
    this.calls.push("roundRect");
  }
  arc(): void {
    this.calls.push("arc");
  }
  setLineDash(): void {
    this.calls.push("setLineDash");
  }
  drawImage(): void {
    this.calls.push("drawImage");
  }
}

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const scene: Scene = {
  nodes: [
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, rows: null },
    { id: snid("B"), bounds: rect(0, 80, 60, 40), label: "B", shape: "diamond", parent: null, icon: null, rowDivider: null, rows: null },
  ],
  edges: [
    {
      id: seid("e0"),
      from: snid("A"),
      to: snid("B"),
      waypoints: [point(30, 40), point(30, 80)],
      label: null,
      stroke: "solid",
      fromEnd: "none",
      toEnd: "arrow",
    },
  ],
  extent: rect(0, 0, 60, 120),
};

const iconScene: Scene = {
  nodes: [
    {
      id: snid("S"),
      bounds: rect(0, 0, 80, 48),
      label: "Web",
      shape: "rect",
      parent: null,
      icon: { pack: "arch", name: "server" },
      rowDivider: null, rows: null,
    },
  ],
  edges: [],
  extent: rect(0, 0, 80, 48),
};

describe("paint", () => {
  it("executes the display list against the context", () => {
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(scene));
    expect(ctx.calls.filter((c) => c === "roundRect")).toHaveLength(1);
    expect(ctx.calls).toContain("closePath");
    expect(ctx.calls).toContain("fillText:A");
    expect(ctx.calls).toContain("fillText:B");
    expect(ctx.calls.filter((c) => c === "moveTo").length).toBeGreaterThanOrEqual(2);
  });

  it("draws crow's-foot ER markers: stroked bars/prongs, a filled triangle, and a ringed circle", () => {
    const er: Scene = {
      nodes: [
        { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, rows: ["int id PK"] },
        { id: snid("B"), bounds: rect(0, 100, 60, 40), label: "B", shape: "rect", parent: null, icon: null, rowDivider: null, rows: null },
      ],
      edges: [
        {
          id: seid("e0"),
          from: snid("A"),
          to: snid("B"),
          waypoints: [point(30, 40), point(30, 100)],
          label: "rel",
          stroke: "dashed",
          fromEnd: "one",
          toEnd: "zeroOrMany",
        },
      ],
      extent: rect(0, 0, 60, 140),
    };
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(er));
    // The "zeroOrMany" ring is drawn with arc(); the row text appears left-aligned in the box.
    expect(ctx.calls).toContain("arc");
    expect(ctx.calls).toContain("fillText:int id PK");
    // The dashed edge stroke plus the bar/prong segments all go through stroke().
    expect(ctx.calls.filter((c) => c === "stroke").length).toBeGreaterThanOrEqual(3);
  });

  it("draws UML class markers (hollow triangle) and a field/method inner divider", () => {
    const cls: Scene = {
      nodes: [
        {
          id: snid("Animal"),
          bounds: rect(0, 0, 120, 70),
          label: "Animal",
          shape: "rect",
          parent: null,
          icon: null,
          rowDivider: 1,
          rows: ["+int age", "+move() void"],
        },
        {
          id: snid("Duck"),
          bounds: rect(0, 120, 100, 30),
          label: "Duck",
          shape: "rect",
          parent: null,
          icon: null,
          rowDivider: null,
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
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(cls));
    // Title + both compartment rows render; the hollow head fills then strokes (closePath used).
    expect(ctx.calls).toContain("fillText:Animal");
    expect(ctx.calls).toContain("fillText:+int age");
    expect(ctx.calls).toContain("fillText:+move() void");
    expect(ctx.calls).toContain("closePath");
    // The box (1) + title divider + inner field/method divider → at least three stroke() calls.
    expect(ctx.calls.filter((c) => c === "stroke").length).toBeGreaterThanOrEqual(3);
  });

  it("draws a multi-line label, scaling the continuation line down", () => {
    const ml: Scene = {
      nodes: [
        { id: snid("C"), bounds: rect(0, 0, 90, 56), label: "API\nHandles", shape: "rect", parent: null, icon: null, rowDivider: null, rows: null },
      ],
      edges: [],
      extent: rect(0, 0, 90, 56),
    };
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(ml), new Map(), { ...defaultTheme, font: "14px sans-serif" });
    expect(ctx.calls).toContain("fillText:API");
    expect(ctx.calls).toContain("fillText:Handles");
    // First line at the base font; the continuation line scaled down (14 * 0.82 ≈ 11.5).
    expect(ctx.fillTextFonts).toEqual(["14px sans-serif", "11.5px sans-serif"]);
  });

  it("uses the supplied theme's font and text colour", () => {
    const theme: Theme = {
      background: "#000000",
      nodeFill: "#000001",
      stroke: "#000002",
      text: "#000003",
      font: "11px monospace",
      sketch: false,
    };
    const nodeOnly: Scene = {
      nodes: [
        { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, rows: null },
      ],
      edges: [],
      extent: rect(0, 0, 60, 40),
    };
    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(nodeOnly), new Map(), theme);
    expect(ctx.font).toBe("11px monospace");
    // For a node-only scene the label is the last draw, so the final fill is the text colour.
    expect(ctx.fillStyle).toBe("#000003");
  });

  it("sketch theme draws wobbly outlines (no roundRect) instead of crisp shapes", () => {
    const crisp = new RecordingCtx();
    paint(crisp, toDisplayList(scene), new Map(), defaultTheme);
    const sketchy = new RecordingCtx();
    paint(sketchy, toDisplayList(scene), new Map(), { ...defaultTheme, sketch: true });
    // Crisp mode uses roundRect for the box; sketch mode never does (it strokes wobbly lines).
    expect(crisp.calls.filter((c) => c === "roundRect").length).toBeGreaterThanOrEqual(1);
    expect(sketchy.calls.filter((c) => c === "roundRect")).toHaveLength(0);
    // Sketch mode is stroke-heavy (multi-pass lines), labels still render.
    expect(sketchy.calls.filter((c) => c === "stroke").length).toBeGreaterThan(
      crisp.calls.filter((c) => c === "stroke").length,
    );
    expect(sketchy.calls).toContain("fillText:A");
  });

  it("draws an icon glyph only when its image is supplied", () => {
    const without = new RecordingCtx();
    paint(without, toDisplayList(iconScene));
    expect(without.calls).not.toContain("drawImage");

    const ctx = new RecordingCtx();
    const fakeImage = new RecordingCtx() as unknown as CanvasImageSource;
    paint(ctx, toDisplayList(iconScene), new Map([["arch/server", fakeImage]]));
    expect(ctx.calls).toContain("drawImage");
    expect(ctx.calls).toContain("fillText:Web");
  });
});
