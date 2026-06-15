import type { IconPack, IconRegistry } from "./registry.js";

// Original 24×24 architecture glyphs authored here under the repo's AGPL license — not vendored,
// so no third-party provenance is needed. Real OSS packs (Kubernetes Apache-2.0, simple-icons CC0,
// devicon MIT) load through this same registry shape with their own provenance; see DO_NEXT.
const ICONS = new Map<string, string>([
  [
    "server",
    '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/><circle cx="7" cy="7.5" r="1"/><circle cx="7" cy="16.5" r="1"/></svg>',
  ],
  [
    "database",
    '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v14c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/></svg>',
  ],
  [
    "cloud",
    '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 18 18z"/></svg>',
  ],
  [
    "user",
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0z"/></svg>',
  ],
  [
    "queue",
    '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="4" height="12"/><rect x="10" y="6" width="4" height="12"/><rect x="17" y="6" width="4" height="12"/></svg>',
  ],
]);

export const builtinPack: IconPack = {
  meta: {
    id: "arch",
    license: "AGPL-3.0-or-later",
    source: "built-in (mermollusc)",
    version: "0.0.0",
  },
  icons: ICONS,
};

export const defaultRegistry: IconRegistry = {
  packs: new Map([[builtinPack.meta.id, builtinPack]]),
};
