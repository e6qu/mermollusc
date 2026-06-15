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

// The renderer's colour/font palette. Callers may supply their own; `defaultTheme` is the light one.
export interface Theme {
  readonly nodeFill: string;
  readonly stroke: string;
  readonly text: string;
  readonly font: string;
}

export const defaultTheme: Theme = {
  nodeFill: "#eef2ff",
  stroke: "#334155",
  text: "#0f172a",
  font: "14px sans-serif",
};

const ARROW_SIZE = 9;

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
        ctx.fillStyle = theme.nodeFill;
        ctx.strokeStyle = theme.stroke;
        ctx.beginPath();
        ctx.roundRect(cmd.x, cmd.y, cmd.width, cmd.height, cmd.radius);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "diamond": {
        const hw = cmd.width / 2;
        const hh = cmd.height / 2;
        ctx.fillStyle = theme.nodeFill;
        ctx.strokeStyle = theme.stroke;
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
        ctx.fillText(cmd.text, cmd.x, cmd.y);
        break;
      }
    }
  }
};
