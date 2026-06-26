import { heuristicMeasure, layout } from "@m/layout";
import { parse } from "@m/parser";
import { type Canvas2D, paint, toDisplayList } from "@m/renderer";
import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";

class RecordingCtx implements Canvas2D {
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  strokeStyle: string | CanvasGradient | CanvasPattern = "";
  lineWidth = 0;
  globalAlpha = 1;
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
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
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
  fillRect(): void {
    this.calls.push("fillRect");
  }
  measureText(text: string): { readonly width: number } {
    return { width: text.length * 7 };
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

describe("text -> pixels pipeline", () => {
  it("parses, lays out, and paints a flowchart end to end", async () => {
    const parsed = parse("flowchart TD\n  A[Start] --> B{Choice}\n  B -->|yes| C(End)\n");
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    const laid = await layout(parsed.value, new Map(), heuristicMeasure);
    expect(isOk(laid)).toBe(true);
    if (!isOk(laid)) return;

    const ctx = new RecordingCtx();
    paint(ctx, toDisplayList(laid.value));

    expect(ctx.calls.some((c) => c === "fillText:Start")).toBe(true);
    expect(ctx.calls.some((c) => c === "fillText:Choice")).toBe(true);
    expect(ctx.calls).toContain("closePath"); // the diamond node B
    expect(ctx.calls.filter((c) => c === "stroke").length).toBeGreaterThan(0);
  });
});
