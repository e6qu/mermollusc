import type { DrawCmd, EndMarker } from "../core/index.js";

// Structural subset of CanvasRenderingContext2D — the methods/props the painter uses. A real
// 2D context is assignable to this; tests pass a recording mock.
export interface Canvas2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
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
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
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

// Scale a CSS font string's px size (for the smaller secondary line); unchanged if it has no px size.
const scaleFont = (font: string, factor: number): string =>
  font.replace(/(\d+(?:\.\d+)?)px/, (_, n) => `${(Number(n) * factor).toFixed(1)}px`);

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

// Render a pre-computed edge-end marker (crow's-foot bars/prongs, arrowheads, UML triangle/diamond
// heads, an optional ring). Geometry is fixed in the core; the painter only strokes/fills primitives.
// A `solid` polygon fills with the stroke colour; a `hollow` one fills with the background and is
// outlined, so an inheritance triangle / aggregation diamond reads as open over whatever it overlaps.
const drawMarker = (ctx: Canvas2D, marker: EndMarker, theme: Theme): void => {
  ctx.strokeStyle = theme.stroke;
  ctx.setLineDash([]);
  for (const [a, b] of marker.lines) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  if (marker.circle !== null) {
    ctx.fillStyle = theme.background;
    ctx.beginPath();
    ctx.arc(marker.circle.center.x, marker.circle.center.y, marker.circle.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  for (const poly of marker.polygons) {
    const [p0, ...rest] = poly.points;
    if (p0 === undefined) continue;
    ctx.fillStyle = poly.fill === "solid" ? theme.stroke : theme.background;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (const p of rest) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
    if (poly.fill === "hollow") ctx.stroke();
  }
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
          drawMarker(ctx, cmd.fromMarker, theme);
          drawMarker(ctx, cmd.toMarker, theme);
          break;
        }
        ctx.setLineDash(cmd.dashed ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (const p of rest) ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
        drawMarker(ctx, cmd.fromMarker, theme);
        drawMarker(ctx, cmd.toMarker, theme);
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
        // A label may carry newlines (e.g. a C4 element's description on a second line); stack the
        // lines centred on the anchor. The first line is the primary label; continuation lines are
        // secondary (a C4 description), so they render smaller and dimmed.
        ctx.textAlign = cmd.align === "left" ? "left" : "center";
        const lines = cmd.text.split("\n");
        const lh = labelLineHeight(theme.font);
        const top = cmd.y - ((lines.length - 1) * lh) / 2;
        for (const [i, line] of lines.entries()) {
          if (i === 0) {
            ctx.fillStyle = theme.text;
            ctx.font = theme.font;
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = theme.text;
            ctx.font = scaleFont(theme.font, 0.82);
            ctx.globalAlpha = 0.7;
          }
          ctx.fillText(line, cmd.x, top + i * lh);
        }
        ctx.font = theme.font;
        ctx.globalAlpha = 1;
        break;
      }
    }
  }
};
