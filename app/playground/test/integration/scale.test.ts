import { hitTest } from "@m/builder";
import { heuristicMeasure, layoutDiagram } from "@m/layout";
import { paint, toDisplayList } from "@m/renderer";
import type { Canvas2D } from "@m/renderer";
import { parseDiagram } from "@m/parser";
import { isOk, point } from "@m/std";
import { describe, expect, it } from "vitest";

// A no-op 2D context: exercises the painter's traversal without rasterising.
class NoopCtx implements Canvas2D {
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 0;
  globalAlpha = 1;
  font = "";
  textAlign: CanvasTextAlign = "center";
  textBaseline: CanvasTextBaseline = "middle";
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  closePath(): void {}
  stroke(): void {}
  fill(): void {}
  fillText(): void {}
  fillRect(): void {}
  measureText(t: string): { readonly width: number } {
    return { width: t.length * 7 };
  }
  roundRect(): void {}
  arc(): void {}
  setLineDash(): void {}
  drawImage(): void {}
}

// A large flowchart (chain + cross-links) drives the whole pipeline at scale — a regression guard
// that hundreds of nodes parse, lay out, build a display list, paint, and hit-test without error.
describe("large-diagram pipeline", () => {
  it("parses, lays out, renders, and hit-tests a 300-node flowchart", async () => {
    const lines = ["flowchart TD"];
    const n = 300;
    for (let i = 1; i < n; i++) lines.push(`  n${i - 1} --> n${i}`);
    for (let i = 0; i + 10 < n; i += 10) lines.push(`  n${i} --> n${i + 10}`);
    const parsed = parseDiagram(`${lines.join("\n")}\n`);
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    const laid = await layoutDiagram(parsed.value, heuristicMeasure);
    expect(isOk(laid)).toBe(true);
    if (!isOk(laid)) return;
    expect(laid.value.nodes).toHaveLength(n);

    const cmds = toDisplayList(laid.value);
    expect(cmds.length).toBeGreaterThan(n);
    paint(new NoopCtx(), cmds);

    // Hit-testing the centre of a node finds a node; deep empty space finds nothing.
    const first = laid.value.nodes[0];
    if (first !== undefined) {
      const c = point(
        first.bounds.origin.x + first.bounds.size.width / 2,
        first.bounds.origin.y + first.bounds.size.height / 2,
      );
      expect(hitTest(laid.value, c)?.kind).toBe("node");
    }
    expect(hitTest(laid.value, point(-9999, -9999))).toBeNull();
  });
});
