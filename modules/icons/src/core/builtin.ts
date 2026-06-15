import type { IconPack, IconRegistry } from "./registry.js";

// Original 24×24 architecture glyphs authored here under the repo's AGPL license — not vendored,
// so no third-party provenance is needed. Names match the network node kinds 1:1. Real OSS packs
// (Kubernetes Apache-2.0, simple-icons CC0, devicon MIT) load through this same registry shape with
// their own provenance; see DO_NEXT.
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
  [
    "router",
    '<svg viewBox="0 0 24 24"><rect x="3" y="13" width="18" height="6" rx="1"/><rect x="5.5" y="8" width="1" height="5"/><rect x="11.5" y="6" width="1" height="7"/><rect x="17.5" y="8" width="1" height="5"/><circle cx="7" cy="16" r="1"/><circle cx="11" cy="16" r="1"/></svg>',
  ],
  [
    "switch",
    '<svg viewBox="0 0 24 24"><path d="M3 8h14l-3-3 1.5-1.5L21 9l-5.5 5.5L14 13l3-3H3z"/><path d="M21 16H7l3 3-1.5 1.5L3 15l5.5-5.5L10 11l-3 3h14z"/></svg>',
  ],
  [
    "firewall",
    '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 8-8 11-4.5-3-8-6-8-11V5z"/></svg>',
  ],
  [
    "host",
    '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1"/><rect x="9" y="17" width="6" height="2"/><rect x="7" y="19" width="10" height="2" rx="1"/></svg>',
  ],
  [
    "compute",
    '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/><rect x="9" y="2" width="1.5" height="3"/><rect x="13.5" y="2" width="1.5" height="3"/><rect x="9" y="19" width="1.5" height="3"/><rect x="13.5" y="19" width="1.5" height="3"/><rect x="2" y="9" width="3" height="1.5"/><rect x="2" y="13.5" width="3" height="1.5"/><rect x="19" y="9" width="3" height="1.5"/><rect x="19" y="13.5" width="3" height="1.5"/></svg>',
  ],
  [
    "storage",
    '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v5c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 13v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5"/></svg>',
  ],
  [
    "cdn",
    '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 18 18z"/><path d="M12 9l3 4h-6z"/></svg>',
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
