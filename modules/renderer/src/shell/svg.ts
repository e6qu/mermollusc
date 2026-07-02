import { assertNever } from "@m/std";
import { labelLines, wedgeColor } from "../core/index.js";
import type { DrawCmd, EndMarker } from "../core/index.js";
import { accentFill, bandFill, defaultTheme, type Theme } from "./paint.js";

// A vector SVG backend that consumes the same `DrawCmd[]` display list as the canvas painter, so an
// export stays in sync with what's on screen. It renders the *crisp* shapes (no sketch jitter — the
// hand-drawn wobble is a screen affordance, not something to bake into a saved file). Pure: maps the
// display list + theme to an SVG document string.

export interface SvgOptions {
  readonly width: number;
  readonly height: number;
  // Drawn elements are translated by `margin` minus this scene-space origin — matching the canvas
  // painter, so content dragged to negative coordinates isn't clipped. Usually `{x:0,y:0}`.
  readonly origin: { readonly x: number; readonly y: number };
  // Drawn elements are translated by this much (the canvas paints the scene inset by a margin).
  readonly margin: number;
  readonly theme: Theme;
  // `${pack}/${name}` → an <image> href (e.g. an SVG data URL) for icon glyphs; misses are skipped.
  readonly icons: ReadonlyMap<string, string>;
}

// Render a pre-computed edge-end marker as SVG primitives, matching the canvas painter exactly.
const markerToSvg = (marker: EndMarker, theme: Theme): string => {
  const parts: string[] = [];
  for (const [a, b] of marker.lines) {
    parts.push(
      `<line x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}" stroke="${theme.stroke}" stroke-width="1.5"/>`,
    );
  }
  if (marker.circle !== null) {
    parts.push(
      `<circle cx="${num(marker.circle.center.x)}" cy="${num(marker.circle.center.y)}" r="${num(marker.circle.radius)}" fill="${theme.background}" stroke="${theme.stroke}" stroke-width="1.5"/>`,
    );
  }
  for (const poly of marker.polygons) {
    const pts = poly.points.map((p) => `${num(p.x)},${num(p.y)}`).join(" ");
    // `solid` fills with stroke; `hollow` fills with background + a stroked outline (UML open heads).
    const style =
      poly.fill === "solid"
        ? `fill="${theme.stroke}"`
        : `fill="${theme.background}" stroke="${theme.stroke}" stroke-width="1.5"`;
    parts.push(`<polygon points="${pts}" ${style}/>`);
  }
  return parts.join("");
};

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const attr = (s: string): string => esc(s).replace(/"/g, "&quot;");

const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

const EDGE_LABEL_TEXT_ALPHA = "0.66";
const EDGE_LABEL_PLATE_ALPHA = "0.66";

const labelLineHeight = (font: string): number => {
  const px = /(\d+(?:\.\d+)?)px/.exec(font)?.[1];
  return (px === undefined ? 14 : Number(px)) * 1.3;
};

const cmdToSvg = (cmd: DrawCmd, theme: Theme, icons: ReadonlyMap<string, string>): string => {
  switch (cmd.kind) {
    case "box":
      return `<rect x="${num(cmd.x)}" y="${num(cmd.y)}" width="${num(cmd.width)}" height="${num(cmd.height)}" rx="${num(cmd.radius)}" fill="${accentFill(cmd.accent, theme)}" stroke="${theme.nodeStroke}" stroke-width="1.5"/>`;
    case "stateStart":
      return `<circle cx="${num(cmd.cx)}" cy="${num(cmd.cy)}" r="${num(Math.max(3, cmd.radius - 3))}" fill="${theme.stroke}"/>`;
    case "junction":
      return `<circle cx="${num(cmd.cx)}" cy="${num(cmd.cy)}" r="${num(cmd.radius)}" fill="${theme.stroke}"/>`;
    case "stateEnd":
      return `<circle cx="${num(cmd.cx)}" cy="${num(cmd.cy)}" r="${num(Math.max(5, cmd.radius - 1))}" fill="${theme.background}" stroke="${theme.stroke}" stroke-width="1.5"/><circle cx="${num(cmd.cx)}" cy="${num(cmd.cy)}" r="${num(Math.max(2.5, cmd.radius - 6))}" fill="${theme.stroke}"/>`;
    case "stateBar":
      return `<rect x="${num(cmd.x)}" y="${num(cmd.y)}" width="${num(cmd.width)}" height="${num(cmd.height)}" rx="${num(Math.min(4, cmd.height / 2))}" fill="${theme.stroke}"/>`;
    case "band":
      return `<rect x="${num(cmd.x)}" y="${num(cmd.y)}" width="${num(cmd.width)}" height="${num(cmd.height)}" fill="${bandFill(cmd.fill, theme)}"/>`;
    case "diamond": {
      const hw = cmd.width / 2;
      const hh = cmd.height / 2;
      const pts = `${num(cmd.cx)},${num(cmd.cy - hh)} ${num(cmd.cx + hw)},${num(cmd.cy)} ${num(cmd.cx)},${num(cmd.cy + hh)} ${num(cmd.cx - hw)},${num(cmd.cy)}`;
      return `<polygon points="${pts}" fill="${theme.nodeFill}" stroke="${theme.nodeStroke}" stroke-width="1.5"/>`;
    }
    case "actor": {
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
      const s = `stroke="${theme.stroke}" stroke-width="1.5"`;
      return (
        `<circle cx="${num(cxm)}" cy="${num(headCy)}" r="${num(r)}" fill="${theme.background}" ${s}/>` +
        `<line x1="${num(cxm)}" y1="${num(bodyTop)}" x2="${num(cxm)}" y2="${num(bodyBot)}" ${s}/>` +
        `<line x1="${num(cxm - armX)}" y1="${num(armY)}" x2="${num(cxm + armX)}" y2="${num(armY)}" ${s}/>` +
        `<line x1="${num(cxm)}" y1="${num(bodyBot)}" x2="${num(cxm - legX)}" y2="${num(legBot)}" ${s}/>` +
        `<line x1="${num(cxm)}" y1="${num(bodyBot)}" x2="${num(cxm + legX)}" y2="${num(legBot)}" ${s}/>`
      );
    }
    case "polyline": {
      const dash = cmd.dashed ? ' stroke-dasharray="6 4"' : "";
      const d = cmd.path
        .map((p) => {
          switch (p.kind) {
            case "moveTo":
              return `M ${num(p.x)} ${num(p.y)}`;
            case "lineTo":
              return `L ${num(p.x)} ${num(p.y)}`;
            case "quadTo":
              return `Q ${num(p.cx)} ${num(p.cy)}, ${num(p.x)} ${num(p.y)}`;
            case "cubicTo":
              return `C ${num(p.c1x)} ${num(p.c1y)}, ${num(p.c2x)} ${num(p.c2y)}, ${num(p.x)} ${num(p.y)}`;
            default:
              return assertNever(p);
          }
        })
        .join(" ");
      const path = `<path d="${d}" fill="none" stroke="${theme.stroke}" stroke-width="1.5"${dash}/>`;
      const mids = cmd.midMarkers.map((m) => markerToSvg(m, theme)).join("");
      return `${path}${markerToSvg(cmd.fromMarker, theme)}${markerToSvg(cmd.toMarker, theme)}${mids}`;
    }
    case "icon": {
      const href = icons.get(`${cmd.ref.pack}/${cmd.ref.name}`);
      if (href === undefined) return "";
      return `<image x="${num(cmd.x)}" y="${num(cmd.y)}" width="${num(cmd.size)}" height="${num(cmd.size)}" href="${attr(href)}"/>`;
    }
    case "label": {
      // Mirror the painter: one <tspan> per line, centred on the anchor. Continuation lines (a C4
      // description) render smaller and dimmed than the first (primary) line.
      const lines = labelLines(cmd.text);
      const lh = labelLineHeight(theme.font);
      const sub = (labelLineHeight(theme.font) / 1.3) * 0.82;
      const top = cmd.y - ((lines.length - 1) * lh) / 2;
      const tspans = lines
        .map((line, i) => {
          const size = i === 0 ? "" : ` font-size="${num(sub)}"`;
          const opacity = cmd.plate ? EDGE_LABEL_TEXT_ALPHA : i === 0 ? "1" : "0.7";
          const style = `${size} fill-opacity="${opacity}"`;
          return `<tspan x="${num(cmd.x)}" y="${num(top + i * lh)}"${style}>${esc(line)}</tspan>`;
        })
        .join("");
      const anchor = cmd.align === "left" ? "start" : "middle";
      const text = `<text text-anchor="${anchor}" dominant-baseline="central" fill="${theme.text}">${tspans}</text>`;
      if (!cmd.plate) return text;
      // A background plate behind an edge label. Width is estimated from the longest line (no font
      // metrics in a pure string backend); a slightly generous box just masks the line cleanly.
      const fontPx = labelLineHeight(theme.font) / 1.3;
      const widest = lines.reduce((w, l) => Math.max(w, l.length), 0);
      const padX = 6;
      const padY = 3;
      const boxW = widest * fontPx * 0.6 + padX * 2;
      const boxH = lines.length * lh + padY * 2;
      const rect = `<rect x="${num(cmd.x - boxW / 2)}" y="${num(top - lh / 2 - padY)}" width="${num(boxW)}" height="${num(boxH)}" rx="3" fill="${theme.background}" fill-opacity="${EDGE_LABEL_PLATE_ALPHA}"/>`;
      return `${rect}${text}`;
    }
    case "wedge": {
      // A full-circle sweep is a legend swatch — a `<circle>` (an SVG arc can't close a full turn).
      if (cmd.endAngle - cmd.startAngle >= Math.PI * 2 - 1e-6 && cmd.innerRadius === 0) {
        return `<circle cx="${num(cmd.cx)}" cy="${num(cmd.cy)}" r="${num(cmd.radius)}" fill="${wedgeColor(cmd.colorIndex)}" stroke="${theme.background}" stroke-width="2"/>`;
      }
      if (cmd.endAngle - cmd.startAngle >= Math.PI * 2 - 1e-6 && cmd.innerRadius > 0) {
        const outerRight = `${num(cmd.cx + cmd.radius)} ${num(cmd.cy)}`;
        const outerLeft = `${num(cmd.cx - cmd.radius)} ${num(cmd.cy)}`;
        const innerRight = `${num(cmd.cx + cmd.innerRadius)} ${num(cmd.cy)}`;
        const innerLeft = `${num(cmd.cx - cmd.innerRadius)} ${num(cmd.cy)}`;
        const d = `M ${outerRight} A ${num(cmd.radius)} ${num(cmd.radius)} 0 1 1 ${outerLeft} A ${num(cmd.radius)} ${num(cmd.radius)} 0 1 1 ${outerRight} M ${innerRight} A ${num(cmd.innerRadius)} ${num(cmd.innerRadius)} 0 1 0 ${innerLeft} A ${num(cmd.innerRadius)} ${num(cmd.innerRadius)} 0 1 0 ${innerRight}`;
        return `<path d="${d}" fill="${wedgeColor(cmd.colorIndex)}" fill-rule="evenodd" stroke="${theme.background}" stroke-width="2"/>`;
      }
      // A sector as an SVG path: line out to the start angle, arc to the end angle, close to centre.
      // Same canvas-convention angles + point formula as the painter, so the two backends agree.
      const x0 = cmd.cx + cmd.radius * Math.cos(cmd.startAngle);
      const y0 = cmd.cy + cmd.radius * Math.sin(cmd.startAngle);
      const x1 = cmd.cx + cmd.radius * Math.cos(cmd.endAngle);
      const y1 = cmd.cy + cmd.radius * Math.sin(cmd.endAngle);
      const largeArc = cmd.endAngle - cmd.startAngle > Math.PI ? 1 : 0;
      if (cmd.innerRadius > 0) {
        const ix0 = cmd.cx + cmd.innerRadius * Math.cos(cmd.startAngle);
        const iy0 = cmd.cy + cmd.innerRadius * Math.sin(cmd.startAngle);
        const ix1 = cmd.cx + cmd.innerRadius * Math.cos(cmd.endAngle);
        const iy1 = cmd.cy + cmd.innerRadius * Math.sin(cmd.endAngle);
        const d = `M ${num(x0)} ${num(y0)} A ${num(cmd.radius)} ${num(cmd.radius)} 0 ${largeArc} 1 ${num(x1)} ${num(y1)} L ${num(ix1)} ${num(iy1)} A ${num(cmd.innerRadius)} ${num(cmd.innerRadius)} 0 ${largeArc} 0 ${num(ix0)} ${num(iy0)} Z`;
        return `<path d="${d}" fill="${wedgeColor(cmd.colorIndex)}" stroke="${theme.background}" stroke-width="2"/>`;
      }
      const d = `M ${num(cmd.cx)} ${num(cmd.cy)} L ${num(x0)} ${num(y0)} A ${num(cmd.radius)} ${num(cmd.radius)} 0 ${largeArc} 1 ${num(x1)} ${num(y1)} Z`;
      return `<path d="${d}" fill="${wedgeColor(cmd.colorIndex)}" stroke="${theme.background}" stroke-width="2"/>`;
    }
  }
};

export const toSvg = (cmds: readonly DrawCmd[], opts: SvgOptions = defaultSvgOptions()): string => {
  const { width, height, margin, origin, theme, icons } = opts;
  // Edge-end markers (arrowheads, crow's-foot glyphs) are emitted inline per polyline as explicit
  // geometry from the core, so the document needs no <marker> defs.
  const body = cmds
    .map((c) => cmdToSvg(c, theme, icons))
    .filter((s) => s !== "")
    .join("\n    ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}" style="font:${attr(theme.font)}">`,
    `  <rect width="${num(width)}" height="${num(height)}" fill="${theme.background}"/>`,
    `  <g transform="translate(${num(margin - origin.x)},${num(margin - origin.y)})">`,
    `    ${body}`,
    "  </g>",
    "</svg>",
    "",
  ].join("\n");
};

const defaultSvgOptions = (): SvgOptions => ({
  width: 0,
  height: 0,
  origin: { x: 0, y: 0 },
  margin: 0,
  theme: defaultTheme,
  icons: new Map(),
});
