import type { IconPack } from "./registry.js";

// Original hand-drawn / xkcd-ish glyphs authored here under the repo's AGPL license — outline-only
// (no fill) so they read as sketches and pair with the renderer's hand-drawn "Sketch" mode. 24×24.
const ICONS = new Map<string, string>([
  [
    "person",
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="5" r="2.5"/><path d="M12 7.5v7M8 19l4-4.5 4 4.5M7.5 10.5c3 1.4 6 1.4 9 0"/></svg>',
  ],
  [
    "server",
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="5" width="16" height="6" rx="1"/><rect x="4" y="13" width="16" height="6" rx="1"/><circle cx="7" cy="8" r="0.8"/><circle cx="7" cy="16" r="0.8"/></svg>',
  ],
  [
    "database",
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/></svg>',
  ],
  [
    "cloud",
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 18 18z"/></svg>',
  ],
  [
    "note",
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3M9 11h6M9 15h6"/></svg>',
  ],
  [
    "box",
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="6" width="18" height="12" rx="2"/></svg>',
  ],
]);

export const sketchPack: IconPack = {
  meta: {
    id: "sketch",
    license: "AGPL-3.0-or-later",
    source: "built-in (mermollusc)",
    version: "0.0.0",
  },
  icons: ICONS,
  categories: new Map<string, readonly string[]>([
    ["people", ["person"]],
    ["infra", ["server", "database", "cloud"]],
    ["doc", ["note"]],
    ["shape", ["box"]],
  ]),
};
