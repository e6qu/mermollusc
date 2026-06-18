import type { Point } from "@m/std";
import type { DrawCmd } from "../core/index.js";

// Structural subset of CanvasRenderingContext2D — the methods/props the painter uses. A real
// 2D context is assignable to this; tests pass a recording mock.
export interface Canvas2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  roundRect(x: number, y: number, w: number, h: number, radius: number): void;
  setLineDash(segments: readonly number[]): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
}

// Resolved icon glyphs keyed by `${pack}/${name}` — built at the shell boundary (SVG → image) and
// handed to the painter, so the renderer core stays free of asset bytes.
export type IconImages = ReadonlyMap<string, CanvasImageSource>;

const iconKey = (pack: string, name: string): string => `${pack}/${name}`;

// The renderer's colour/font palette. `paint` uses node/stroke/text/font; `background` is the
// surface colour the host fills behind the canvas. Callers may supply their own theme.
export interface Theme {
  readonly background: string;
  readonly nodeFill: string;
  readonly stroke: string;
  readonly text: string;
  readonly font: string;
  // When true, shapes are drawn with wobbly, double-stroked "hand-drawn" outlines (no fill).
  readonly sketch: boolean;
}

export const defaultTheme: Theme = {
  background: "#ffffff",
  nodeFill: "#eef2ff",
  stroke: "#334155",
  text: "#0f172a",
  font: "14px sans-serif",
  sketch: false,
};

export const darkTheme: Theme = {
  background: "#0f172a",
  nodeFill: "#1e293b",
  stroke: "#94a3b8",
  text: "#e2e8f0",
  font: "14px sans-serif",
  sketch: false,
};

// Line spacing for multi-line labels, derived from the theme font's px size (default 14).
const labelLineHeight = (font: string): number => {
  const px = /(\d+(?:\.\d+)?)px/.exec(font)?.[1];
  return (px === undefined ? 14 : Number(px)) * 1.3;
};

const ARROW_SIZE = 9;

// Deterministic LCG so the jitter is stable across repaints (no flicker) and unit-testable.
const lcg = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const seedOf = (a: number, b: number, c: number): number =>
  (Math.imul(Math.imul(7, 31) + Math.floor(a), 31) +
    Math.imul(Math.floor(b), 31) +
    Math.floor(c)) >>>
  0;

// A wobbly, double-stroked line — the hand-drawn look — using only moveTo/lineTo/stroke so it works
// against the structural Canvas2D (and its test mock). Seeded jitter keeps it stable per shape.
const sketchLine = (
  ctx: Canvas2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
): void => {
  const rnd = lcg(seed);
  const j = (m: number): number => (rnd() * 2 - 1) * m;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    ctx.moveTo(x1 + j(1.5), y1 + j(1.5));
    for (let i = 1; i <= 3; i++) {
      const t = i / 3;
      ctx.lineTo(x1 + (x2 - x1) * t + j(2), y1 + (y2 - y1) * t + j(2));
    }
    ctx.stroke();
  }
};

const sketchRect = (ctx: Canvas2D, x: number, y: number, w: number, h: number, s: number): void => {
  sketchLine(ctx, x, y, x + w, y, s);
  sketchLine(ctx, x + w, y, x + w, y + h, s + 1);
  sketchLine(ctx, x + w, y + h, x, y + h, s + 2);
  sketchLine(ctx, x, y + h, x, y, s + 3);
};

const drawArrowHead = (ctx: Canvas2D, points: readonly Point[], stroke: string): void => {
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  if (tip === undefined || prev === undefined) return;
  const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  const left = angle + Math.PI - 0.4;
  const right = angle + Math.PI + 0.4;
  ctx.fillStyle = stroke;
  ctx.beginPath();
  ctx.moveTo(tip.x + ARROW_SIZE * Math.cos(left), tip.y + ARROW_SIZE * Math.sin(left));
  ctx.lineTo(tip.x, tip.y);
  ctx.lineTo(tip.x + ARROW_SIZE * Math.cos(right), tip.y + ARROW_SIZE * Math.sin(right));
  ctx.closePath();
  ctx.fill();
};

export const paint = (
  ctx: Canvas2D,
  cmds: readonly DrawCmd[],
  iconImages: IconImages = new Map(),
  theme: Theme = defaultTheme,
): void => {
  ctx.lineWidth = 1.5;
  ctx.font = theme.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const cmd of cmds) {
    switch (cmd.kind) {
      case "box": {
        ctx.strokeStyle = theme.stroke;
        if (theme.sketch) {
          sketchRect(ctx, cmd.x, cmd.y, cmd.width, cmd.height, seedOf(cmd.x, cmd.y, cmd.width));
          break;
        }
        ctx.fillStyle = theme.nodeFill;
        ctx.beginPath();
        ctx.roundRect(cmd.x, cmd.y, cmd.width, cmd.height, cmd.radius);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "diamond": {
        const hw = cmd.width / 2;
        const hh = cmd.height / 2;
        ctx.strokeStyle = theme.stroke;
        if (theme.sketch) {
          const s = seedOf(cmd.cx, cmd.cy, cmd.width);
          sketchLine(ctx, cmd.cx, cmd.cy - hh, cmd.cx + hw, cmd.cy, s);
          sketchLine(ctx, cmd.cx + hw, cmd.cy, cmd.cx, cmd.cy + hh, s + 1);
          sketchLine(ctx, cmd.cx, cmd.cy + hh, cmd.cx - hw, cmd.cy, s + 2);
          sketchLine(ctx, cmd.cx - hw, cmd.cy, cmd.cx, cmd.cy - hh, s + 3);
          break;
        }
        ctx.fillStyle = theme.nodeFill;
        ctx.beginPath();
        ctx.moveTo(cmd.cx, cmd.cy - hh);
        ctx.lineTo(cmd.cx + hw, cmd.cy);
        ctx.lineTo(cmd.cx, cmd.cy + hh);
        ctx.lineTo(cmd.cx - hw, cmd.cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "polyline": {
        const [first, ...rest] = cmd.points;
        if (first === undefined) break;
        ctx.strokeStyle = theme.stroke;
        // Sketch mode wobbles solid edges; dashed edges stay crisp (the dash carries the meaning).
        if (theme.sketch && !cmd.dashed) {
          let prev = first;
          let seed = seedOf(first.x, first.y, cmd.points.length);
          for (const p of rest) {
            sketchLine(ctx, prev.x, prev.y, p.x, p.y, seed++);
            prev = p;
          }
          if (cmd.arrow) drawArrowHead(ctx, cmd.points, theme.stroke);
          break;
        }
        ctx.setLineDash(cmd.dashed ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (const p of rest) ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (cmd.arrow) drawArrowHead(ctx, cmd.points, theme.stroke);
        break;
      }
      case "icon": {
        // The app pre-resolves every icon ref before painting; a miss here means it logged the
        // resolve failure already, so the box + label still render without the glyph.
        const image = iconImages.get(iconKey(cmd.ref.pack, cmd.ref.name));
        if (image !== undefined) ctx.drawImage(image, cmd.x, cmd.y, cmd.size, cmd.size);
        break;
      }
      case "label": {
        ctx.fillStyle = theme.text;
        // A label may carry newlines (e.g. a C4 element's description on a second line); stack the
        // lines centred on the anchor so the block stays vertically centred in the node.
        const lines = cmd.text.split("\n");
        const lh = labelLineHeight(theme.font);
        const top = cmd.y - ((lines.length - 1) * lh) / 2;
        for (const [i, line] of lines.entries()) ctx.fillText(line, cmd.x, top + i * lh);
        break;
      }
    }
  }
};
