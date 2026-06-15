import { brand, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { toDisplayList } from "../../src/core/display.js";
import { type Canvas2D, defaultTheme, paint, type Theme } from "../../src/shell/paint.js";

class RecordingCtx implements Canvas2D {
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  strokeStyle: string | CanvasGradient | CanvasPattern = "";
  lineWidth = 0;
  font = "";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly calls: string[] = [];
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
  }
  roundRect(): void {
    this.calls.push("roundRect");
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
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null },
    { id: snid("B"), bounds: rect(0, 80, 60, 40), label: "B", shape: "diamond", parent: null, icon: null },
  ],
  edges: [
    {
      id: seid("e0"),
      from: snid("A"),
      to: snid("B"),
      waypoints: [point(30, 40), point(30, 80)],
      label: null,
      stroke: "solid",
      arrow: "filled",
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
        { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null },
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
