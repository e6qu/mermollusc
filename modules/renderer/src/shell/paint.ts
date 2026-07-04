import { assertNever } from "@m/std";
import type { BandFill, NodeAccent } from "@m/contracts";
import { labelLines, wedgeColor } from "../core/index.js";
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
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  measureText(text: string): { readonly width: number };
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
  // Node OUTLINES only (boxes, diamonds); lines/markers/pseudo-states use `stroke`. Split because real
  // Mermaid borders nodes in a different colour (purple) than its edge lines (dark grey).
  readonly nodeStroke: string;
  readonly stroke: string;
  readonly text: string;
  readonly font: string;
  // When true, shapes are drawn with wobbly, double-stroked "hand-drawn" outlines.
  readonly sketch: boolean;
}

// Background relative luminance < 0.4 → a dark theme, so accents use deeper fills that read on it.
const isDarkTheme = (theme: Theme): boolean => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(theme.background);
  if (m === null) return false;
  const c = (i: number): number => Number.parseInt(m[i] ?? "0", 16) / 255;
  return 0.299 * c(1) + 0.587 * c(2) + 0.114 * c(3) < 0.4;
};

// A node's semantic fill accent → a concrete colour (theme-aware). `none` is the ordinary node fill;
// muted/active/danger cover generic status, and the architecture accents let cloud/network diagrams
// keep provider/service roles visible without embedding raw colours in layout. Exhaustive, so a new
// accent must be handled here.
export const accentFill = (accent: NodeAccent, theme: Theme): string => {
  const dark = isDarkTheme(theme);
  switch (accent) {
    case "none":
      return theme.nodeFill;
    case "muted":
      return dark ? "#475569" : "#e2e8f0";
    case "active":
      return dark ? "#1d4ed8" : "#bfdbfe";
    case "danger":
      return dark ? "#b91c1c" : "#fecaca";
    case "compute":
      return dark ? "#14532d" : "#dcfce7";
    case "data":
      return dark ? "#713f12" : "#fef3c7";
    case "network":
      return dark ? "#164e63" : "#cffafe";
    case "security":
      return dark ? "#7f1d1d" : "#fee2e2";
    case "ops":
      return dark ? "#4c1d95" : "#ede9fe";
    default:
      return assertNever(accent);
  }
};

// An edge's semantic STROKE accent → a concrete line colour (the connector counterpart to `accentFill`).
// `none` is the theme's ordinary edge colour; the rest are saturated hues that read on both the light
// and dark canvas — the same accent as a node's fill, but a stroke needs more punch than a pale fill.
// Exhaustive, so a new accent must be handled here too.
export const accentStroke = (accent: NodeAccent, theme: Theme): string => {
  switch (accent) {
    case "none":
      return theme.stroke;
    case "muted":
      return "#64748b";
    case "active":
      return "#2563eb";
    case "danger":
      return "#dc2626";
    case "compute":
      return "#16a34a";
    case "data":
      return "#d97706";
    case "network":
      return "#0891b2";
    case "security":
      return "#e11d48";
    case "ops":
      return "#7c3aed";
    default:
      return assertNever(accent);
  }
};

// A background band's semantic fill → a concrete colour (theme-aware). The two `section` shades are a
// faint zebra stripe behind successive Gantt sections; `excluded` is a slightly greyer non-working-day
// column. All are kept subtler than a node's fill so the bars stay dominant. Exhaustive.
export const bandFill = (fill: BandFill, theme: Theme): string => {
  const dark = isDarkTheme(theme);
  switch (fill) {
    case "section":
      return dark ? "#1c2433" : "#eaeff7";
    // Must differ from `background` (dark `sectionAlt` was identical to it — an invisible band) and from
    // `section`, so the zebra reads; both stay subtler than a node's fill so the bars stay dominant.
    case "sectionAlt":
      return dark ? "#141d2c" : "#f6f8fc";
    case "excluded":
      return dark ? "#2c3850" : "#dfe4ee";
    default:
      return assertNever(fill);
  }
};

// The light theme matches real Mermaid's defaults — palette AND font taken from mermaid's own
// theme-default.js (https://github.com/mermaid-js/mermaid, packages/mermaid/src/themes/theme-default.js:
// mainBkg '#ECECFF', border1 '#9370DB', textColor/lineColor '#333', fontFamily '"trebuchet ms", verdana,
// arial, sans-serif', fontSize 16px), so an out-of-the-box diagram reads like Mermaid output. The font
// feeds measureText, so it also sizes nodes the way Mermaid would.
const MERMAID_FONT = '16px "trebuchet ms", verdana, arial, sans-serif';

export const defaultTheme: Theme = {
  background: "#ffffff",
  nodeFill: "#ECECFF",
  nodeStroke: "#9370DB",
  stroke: "#333333",
  text: "#333333",
  font: MERMAID_FONT,
  sketch: false,
};

export const darkTheme: Theme = {
  background: "#0f172a",
  nodeFill: "#1e293b",
  nodeStroke: "#94a3b8",
  stroke: "#94a3b8",
  text: "#e2e8f0",
  font: MERMAID_FONT,
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

const EDGE_LABEL_TEXT_ALPHA = 0.75;

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

const sketchFillRect = (
  ctx: Canvas2D,
  fill: string,
  bg: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void => {
  // Lay an opaque background fill first so an edge routed *under* this node is occluded — then the
  // translucent accent on top keeps the hand-drawn look. Without the opaque base the 0.62-alpha colour
  // lets the edge show through and it reads as drawn *over* the node.
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.globalAlpha = 0.62;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
};

// Render a pre-computed edge-end marker (crow's-foot bars/prongs, arrowheads, UML triangle/diamond
// heads, an optional ring). Geometry is fixed in the core; the painter only strokes/fills primitives.
// A `solid` polygon fills with the stroke colour; a `hollow` one fills with the background and is
// outlined, so an inheritance triangle / aggregation diamond reads as open over whatever it overlaps.
const drawMarker = (ctx: Canvas2D, marker: EndMarker, theme: Theme, color: string): void => {
  ctx.strokeStyle = color;
  ctx.setLineDash([]);
  for (const [a, b] of marker.lines) {
    // In sketch mode the line segments (crow's-foot prongs, cardinality bars, the open-arrow V)
    // wobble to match the hand-drawn edge they sit on; filled heads stay solid (like the edge fills).
    if (theme.sketch) {
      sketchLine(ctx, a.x, a.y, b.x, b.y, seedOf(a.x, a.y, b.x));
      continue;
    }
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
    ctx.fillStyle = poly.fill === "solid" ? color : theme.background;
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
        // A raw `fill`/`stroke` from a Mermaid `style`/`classDef` directive wins over the accent/theme.
        ctx.strokeStyle = cmd.stroke ?? theme.nodeStroke;
        const fill = cmd.fill ?? accentFill(cmd.accent, theme);
        if (theme.sketch) {
          sketchFillRect(ctx, fill, theme.background, cmd.x, cmd.y, cmd.width, cmd.height);
          sketchRect(ctx, cmd.x, cmd.y, cmd.width, cmd.height, seedOf(cmd.x, cmd.y, cmd.width));
          break;
        }
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(cmd.x, cmd.y, cmd.width, cmd.height, cmd.radius);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "stateStart": {
        ctx.fillStyle = theme.stroke;
        ctx.beginPath();
        ctx.arc(cmd.cx, cmd.cy, Math.max(3, cmd.radius - 3), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "junction": {
        ctx.fillStyle = theme.stroke;
        ctx.beginPath();
        ctx.arc(cmd.cx, cmd.cy, cmd.radius, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "stateEnd": {
        ctx.fillStyle = theme.background;
        ctx.strokeStyle = theme.stroke;
        ctx.beginPath();
        ctx.arc(cmd.cx, cmd.cy, Math.max(5, cmd.radius - 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = theme.stroke;
        ctx.beginPath();
        ctx.arc(cmd.cx, cmd.cy, Math.max(2.5, cmd.radius - 6), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "stateBar": {
        ctx.fillStyle = theme.stroke;
        ctx.beginPath();
        ctx.roundRect(cmd.x, cmd.y, cmd.width, cmd.height, Math.min(4, cmd.height / 2));
        ctx.fill();
        break;
      }
      case "diamond": {
        const hw = cmd.width / 2;
        const hh = cmd.height / 2;
        ctx.strokeStyle = theme.nodeStroke;
        if (theme.sketch) {
          const s = seedOf(cmd.cx, cmd.cy, cmd.width);
          // Opaque base + translucent accent so an edge routed under the diamond is occluded (the sketch
          // outline alone left it see-through, so the edge read as drawn over the node).
          ctx.beginPath();
          ctx.moveTo(cmd.cx, cmd.cy - hh);
          ctx.lineTo(cmd.cx + hw, cmd.cy);
          ctx.lineTo(cmd.cx, cmd.cy + hh);
          ctx.lineTo(cmd.cx - hw, cmd.cy);
          ctx.closePath();
          ctx.fillStyle = theme.background;
          ctx.fill();
          ctx.fillStyle = theme.nodeFill;
          ctx.globalAlpha = 0.62;
          ctx.fill();
          ctx.globalAlpha = 1;
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
      case "actor": {
        // A stickman drawn to fit the box's upper part (the label sits on the bottom row).
        const figureH = cmd.height - 16;
        const cxm = cmd.x + cmd.width / 2;
        const r = Math.max(4, figureH * 0.16);
        const headCy = cmd.y + r + 2;
        const bodyTop = headCy + r;
        const bodyBot = cmd.y + figureH * 0.66;
        const armY = bodyTop + (bodyBot - bodyTop) * 0.25;
        const armX = cmd.width * 0.22;
        const legX = cmd.width * 0.16;
        const legBot = cmd.y + figureH * 0.92;
        ctx.strokeStyle = theme.stroke;
        ctx.fillStyle = theme.background;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(cxm, headCy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cxm, bodyTop);
        ctx.lineTo(cxm, bodyBot); // body
        ctx.moveTo(cxm - armX, armY);
        ctx.lineTo(cxm + armX, armY); // arms
        ctx.moveTo(cxm, bodyBot);
        ctx.lineTo(cxm - legX, legBot); // left leg
        ctx.moveTo(cxm, bodyBot);
        ctx.lineTo(cxm + legX, legBot); // right leg
        ctx.stroke();
        break;
      }
      case "polyline": {
        const [first, ...rest] = cmd.points;
        if (first === undefined) break;
        // A raw `strokeColor` from a Mermaid `linkStyle` directive wins over the accent/theme.
        const edgeColor = cmd.strokeColor ?? accentStroke(cmd.accent, theme);
        ctx.strokeStyle = edgeColor;

        // Sketch mode wobbles solid edges; dashed edges stay crisp (the dash carries the meaning).
        if (theme.sketch && !cmd.dashed) {
          let prev = first;
          let seed = seedOf(first.x, first.y, cmd.points.length);
          for (const p of rest) {
            sketchLine(ctx, prev.x, prev.y, p.x, p.y, seed++);
            prev = p;
          }
          drawMarker(ctx, cmd.fromMarker, theme, edgeColor);
          drawMarker(ctx, cmd.toMarker, theme, edgeColor);
          for (const m of cmd.midMarkers) drawMarker(ctx, m, theme, edgeColor);
          break;
        }

        ctx.setLineDash(cmd.dashed ? [6, 4] : []);
        ctx.beginPath();
        for (const p of cmd.path) {
          switch (p.kind) {
            case "moveTo":
              ctx.moveTo(p.x, p.y);
              break;
            case "lineTo":
              ctx.lineTo(p.x, p.y);
              break;
            case "quadTo":
              ctx.quadraticCurveTo(p.cx, p.cy, p.x, p.y);
              break;
            case "cubicTo":
              ctx.bezierCurveTo(p.c1x, p.c1y, p.c2x, p.c2y, p.x, p.y);
              break;
            default:
              assertNever(p);
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);
        drawMarker(ctx, cmd.fromMarker, theme, edgeColor);
        drawMarker(ctx, cmd.toMarker, theme, edgeColor);
        for (const m of cmd.midMarkers) drawMarker(ctx, m, theme, edgeColor);
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
        const lines = labelLines(cmd.text);
        const lh = labelLineHeight(theme.font);
        const top = cmd.y - ((lines.length - 1) * lh) / 2;
        const isEdge = cmd.labelStyle !== "node";
        // A vertical edge label ("edge-masked") sits on a small OPAQUE plate that hides the line behind
        // it — cheaper on horizontal space than dodging aside. Horizontal edge labels ("edge") are
        // lifted above the line and draw as bare transparent text. Node labels sit on their own box.
        if (cmd.labelStyle === "edge-masked") {
          ctx.font = theme.font;
          const widest = lines.reduce((w, l) => Math.max(w, ctx.measureText(l).width), 0);
          const padX = 4;
          const padY = 2;
          const boxW = widest + padX * 2;
          const boxH = lines.length * lh + padY * 2;
          ctx.fillStyle = theme.background;
          const bx = cmd.align === "left" ? cmd.x - padX : cmd.x - boxW / 2;
          ctx.fillRect(bx, top - lh / 2 - padY, boxW, boxH);
        }
        for (const [i, line] of lines.entries()) {
          ctx.fillStyle = theme.text;
          ctx.font = i === 0 ? theme.font : scaleFont(theme.font, 0.82);
          ctx.globalAlpha = isEdge ? EDGE_LABEL_TEXT_ALPHA : i === 0 ? 1 : 0.7;
          ctx.fillText(line, cmd.x, top + i * lh);
        }
        ctx.font = theme.font;
        ctx.globalAlpha = 1;
        break;
      }
      case "band": {
        ctx.fillStyle = bandFill(cmd.fill, theme);
        ctx.fillRect(cmd.x, cmd.y, cmd.width, cmd.height);
        break;
      }
      case "wedge": {
        // A full-circle sweep is a legend swatch: a plain disc (no centre vertex / closing radius).
        const full = cmd.endAngle - cmd.startAngle >= Math.PI * 2 - 1e-6;
        ctx.fillStyle = wedgeColor(cmd.colorIndex);
        ctx.strokeStyle = theme.background;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (cmd.innerRadius > 0) {
          const outerStartX = cmd.cx + cmd.radius * Math.cos(cmd.startAngle);
          const outerStartY = cmd.cy + cmd.radius * Math.sin(cmd.startAngle);
          const innerEndX = cmd.cx + cmd.innerRadius * Math.cos(cmd.endAngle);
          const innerEndY = cmd.cy + cmd.innerRadius * Math.sin(cmd.endAngle);
          ctx.moveTo(outerStartX, outerStartY);
          ctx.arc(cmd.cx, cmd.cy, cmd.radius, cmd.startAngle, cmd.endAngle);
          ctx.lineTo(innerEndX, innerEndY);
          ctx.arc(cmd.cx, cmd.cy, cmd.innerRadius, cmd.endAngle, cmd.startAngle);
          ctx.closePath();
        } else {
          if (!full) ctx.moveTo(cmd.cx, cmd.cy);
          ctx.arc(cmd.cx, cmd.cy, cmd.radius, cmd.startAngle, cmd.endAngle);
          if (!full) ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 1.5;
        break;
      }
      default:
        // A new DrawCmd variant must be handled here (and in the SVG backend), not silently skipped.
        assertNever(cmd);
    }
  }
};
