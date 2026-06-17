import type { DrawCmd } from "../core/index.js";
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

const ARROW = 9;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const attr = (s: string): string => esc(s).replace(/"/g, "&quot;");

const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

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
      const marker = cmd.arrow ? ' marker-end="url(#arrow)"' : "";
      return `<polyline points="${pts}" fill="none" stroke="${theme.stroke}" stroke-width="1.5"${dash}${marker}/>`;
    }
    case "icon": {
      const href = icons.get(`${cmd.ref.pack}/${cmd.ref.name}`);
      if (href === undefined) return "";
      return `<image x="${num(cmd.x)}" y="${num(cmd.y)}" width="${num(cmd.size)}" height="${num(cmd.size)}" href="${attr(href)}"/>`;
    }
    case "label":
      return `<text x="${num(cmd.x)}" y="${num(cmd.y)}" text-anchor="middle" dominant-baseline="central" fill="${theme.text}">${esc(cmd.text)}</text>`;
  }
};

export const toSvg = (cmds: readonly DrawCmd[], opts: SvgOptions = defaultSvgOptions()): string => {
  const { width, height, margin, theme, icons } = opts;
  // An arrowhead marker matching the painter's filled triangle; userSpaceOnUse so it doesn't scale
  // with stroke-width and stays the painter's size.
  const marker = `<marker id="arrow" markerUnits="userSpaceOnUse" markerWidth="${ARROW + 2}" markerHeight="${ARROW + 2}" refX="${ARROW}" refY="${ARROW / 2}" orient="auto"><path d="M0,0 L${ARROW},${ARROW / 2} L0,${ARROW} Z" fill="${theme.stroke}"/></marker>`;
  const body = cmds
    .map((c) => cmdToSvg(c, theme, icons))
    .filter((s) => s !== "")
    .join("\n    ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}" style="font:${attr(theme.font)}">`,
    `  <rect width="${num(width)}" height="${num(height)}" fill="${theme.background}"/>`,
    `  <defs>${marker}</defs>`,
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
