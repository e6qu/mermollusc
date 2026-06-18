import type { DrawCmd, EndMarker } from "../core/index.js";
import { defaultTheme, type Theme } from "./paint.js";

// A vector SVG backend that consumes the same `DrawCmd[]` display list as the canvas painter, so an
// export stays in sync with what's on screen. It renders the *crisp* shapes (no sketch jitter — the
// hand-drawn wobble is a screen affordance, not something to bake into a saved file). Pure: maps the
// display list + theme to an SVG document string.

export interface SvgOptions {
  readonly width: number;
  readonly height: number;
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
  if (marker.triangle !== null) {
    const pts = marker.triangle.map((p) => `${num(p.x)},${num(p.y)}`).join(" ");
    parts.push(`<polygon points="${pts}" fill="${theme.stroke}"/>`);
  }
  return parts.join("");
};

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const attr = (s: string): string => esc(s).replace(/"/g, "&quot;");

const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

const labelLineHeight = (font: string): number => {
  const px = /(\d+(?:\.\d+)?)px/.exec(font)?.[1];
  return (px === undefined ? 14 : Number(px)) * 1.3;
};

const cmdToSvg = (cmd: DrawCmd, theme: Theme, icons: ReadonlyMap<string, string>): string => {
  switch (cmd.kind) {
    case "box":
      return `<rect x="${num(cmd.x)}" y="${num(cmd.y)}" width="${num(cmd.width)}" height="${num(cmd.height)}" rx="${num(cmd.radius)}" fill="${theme.nodeFill}" stroke="${theme.stroke}" stroke-width="1.5"/>`;
    case "diamond": {
      const hw = cmd.width / 2;
      const hh = cmd.height / 2;
      const pts = `${num(cmd.cx)},${num(cmd.cy - hh)} ${num(cmd.cx + hw)},${num(cmd.cy)} ${num(cmd.cx)},${num(cmd.cy + hh)} ${num(cmd.cx - hw)},${num(cmd.cy)}`;
      return `<polygon points="${pts}" fill="${theme.nodeFill}" stroke="${theme.stroke}" stroke-width="1.5"/>`;
    }
    case "polyline": {
      const pts = cmd.points.map((p) => `${num(p.x)},${num(p.y)}`).join(" ");
      const dash = cmd.dashed ? ' stroke-dasharray="6 4"' : "";
      const line = `<polyline points="${pts}" fill="none" stroke="${theme.stroke}" stroke-width="1.5"${dash}/>`;
      return `${line}${markerToSvg(cmd.fromMarker, theme)}${markerToSvg(cmd.toMarker, theme)}`;
    }
    case "icon": {
      const href = icons.get(`${cmd.ref.pack}/${cmd.ref.name}`);
      if (href === undefined) return "";
      return `<image x="${num(cmd.x)}" y="${num(cmd.y)}" width="${num(cmd.size)}" height="${num(cmd.size)}" href="${attr(href)}"/>`;
    }
    case "label": {
      // Mirror the painter: one <tspan> per line, centred on the anchor. Continuation lines (a C4
      // description) render smaller and dimmed than the first (primary) line.
      const lines = cmd.text.split("\n");
      const lh = labelLineHeight(theme.font);
      const sub = (labelLineHeight(theme.font) / 1.3) * 0.82;
      const top = cmd.y - ((lines.length - 1) * lh) / 2;
      const tspans = lines
        .map((line, i) => {
          const style = i === 0 ? "" : ` font-size="${num(sub)}" fill-opacity="0.7"`;
          return `<tspan x="${num(cmd.x)}" y="${num(top + i * lh)}"${style}>${esc(line)}</tspan>`;
        })
        .join("");
      const anchor = cmd.align === "left" ? "start" : "middle";
      return `<text text-anchor="${anchor}" dominant-baseline="central" fill="${theme.text}">${tspans}</text>`;
    }
  }
};

export const toSvg = (cmds: readonly DrawCmd[], opts: SvgOptions = defaultSvgOptions()): string => {
  const { width, height, margin, theme, icons } = opts;
  // Edge-end markers (arrowheads, crow's-foot glyphs) are emitted inline per polyline as explicit
  // geometry from the core, so the document needs no <marker> defs.
  const body = cmds
    .map((c) => cmdToSvg(c, theme, icons))
    .filter((s) => s !== "")
    .join("\n    ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}" style="font:${attr(theme.font)}">`,
    `  <rect width="${num(width)}" height="${num(height)}" fill="${theme.background}"/>`,
    `  <g transform="translate(${num(margin)},${num(margin)})">`,
    `    ${body}`,
    "  </g>",
    "</svg>",
    "",
  ].join("\n");
};

const defaultSvgOptions = (): SvgOptions => ({
  width: 0,
  height: 0,
  margin: 0,
  theme: defaultTheme,
  icons: new Map(),
});
