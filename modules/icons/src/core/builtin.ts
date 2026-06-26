import { bpmnPack } from "./bpmn.js";
import type { IconPack, IconRegistry } from "./registry.js";
import { sketchPack } from "./sketch.js";
import { vendoredPacks } from "./vendored.js";

// Original 24×24 architecture glyphs authored here under the repo's AGPL license — not vendored,
// so no third-party provenance is needed. Names match the network node kinds 1:1. Real OSS packs
// (Kubernetes Apache-2.0, simple-icons CC0, devicon MIT) load through this same registry shape with
// their own provenance; see DO_NEXT.
const ICONS = new Map<string, string>([
  [
    "server",
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="7" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/><circle cx="7" cy="7.5" r="1"/><circle cx="7" cy="16.5" r="1"/></svg>',
  ],
  [
    "database",
    '<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v14c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/></svg>',
  ],
  [
    "cloud",
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 18 18z"/></svg>',
  ],
  [
    "user",
    '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0z"/></svg>',
  ],
  [
    "queue",
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="6" width="4" height="12"/><rect x="10" y="6" width="4" height="12"/><rect x="17" y="6" width="4" height="12"/></svg>',
  ],
  [
    "router",
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="13" width="18" height="6" rx="1"/><rect x="5.5" y="8" width="1" height="5"/><rect x="11.5" y="6" width="1" height="7"/><rect x="17.5" y="8" width="1" height="5"/><circle cx="7" cy="16" r="1"/><circle cx="11" cy="16" r="1"/></svg>',
  ],
  [
    "switch",
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8h14l-3-3 1.5-1.5L21 9l-5.5 5.5L14 13l3-3H3z"/><path d="M21 16H7l3 3-1.5 1.5L3 15l5.5-5.5L10 11l-3 3h14z"/></svg>',
  ],
  [
    "firewall",
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l8 3v6c0 5-3.5 8-8 11-4.5-3-8-6-8-11V5z"/></svg>',
  ],
  [
    "host",
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="12" rx="1"/><rect x="9" y="17" width="6" height="2"/><rect x="7" y="19" width="10" height="2" rx="1"/></svg>',
  ],
  [
    "compute",
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/><rect x="9" y="2" width="1.5" height="3"/><rect x="13.5" y="2" width="1.5" height="3"/><rect x="9" y="19" width="1.5" height="3"/><rect x="13.5" y="19" width="1.5" height="3"/><rect x="2" y="9" width="3" height="1.5"/><rect x="2" y="13.5" width="3" height="1.5"/><rect x="19" y="9" width="3" height="1.5"/><rect x="19" y="13.5" width="3" height="1.5"/></svg>',
  ],
  [
    "storage",
    '<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v5c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 13v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5"/></svg>',
  ],
  [
    "cdn",
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 18 18z"/><path d="M12 9l3 4h-6z"/></svg>',
  ],
  [
    "load-balancer",
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="9.5" y="2" width="5" height="5" rx="1"/><rect x="2.5" y="16" width="5" height="5" rx="1"/><rect x="9.5" y="16" width="5" height="5" rx="1"/><rect x="16.5" y="16" width="5" height="5" rx="1"/><rect x="11.5" y="7" width="1" height="4"/><rect x="5" y="11" width="14" height="1"/><rect x="4.5" y="11" width="1" height="5"/><rect x="11.5" y="11" width="1" height="5"/><rect x="18.5" y="11" width="1" height="5"/></svg>',
  ],
  [
    "gateway",
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 21V10a9 9 0 0 1 18 0v11h-4V10a5 5 0 0 0-10 0v11z"/></svg>',
  ],
  [
    "container",
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="3" height="4" rx="1"/><rect x="16" y="3" width="3" height="4" rx="1"/><rect x="2.5" y="7" width="19" height="13" rx="1.5"/></svg>',
  ],
  [
    "microservice",
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l8.5 5v10L12 22l-8.5-5V7z"/></svg>',
  ],
  [
    "cache",
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
  ],
  [
    "bucket",
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 7l1.5 13a1 1 0 0 0 1 .9h11a1 1 0 0 0 1-.9L21 7z"/><ellipse cx="12.5" cy="6.5" rx="8.5" ry="2.3"/></svg>',
  ],
  [
    "key",
    '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="7.5" cy="7.5" r="4.5"/><path d="M10 10l9 9v2.5h-2.5v-2h-2v-2l-2.5-2.5z"/></svg>',
  ],
  [
    "lock",
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
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
  categories: new Map<string, readonly string[]>([
    ["compute", ["server", "compute", "host", "container", "microservice"]],
    ["data", ["database", "storage", "bucket", "cache"]],
    ["network", ["router", "switch", "cloud", "cdn", "load-balancer", "gateway"]],
    ["messaging", ["queue"]],
    ["security", ["firewall", "key", "lock"]],
    ["people", ["user"]],
  ]),
};

// The built-in glyph packs (arch + BPMN + sketch) plus the bundled, provenance-pinned OSS packs.
export const defaultRegistry: IconRegistry = {
  packs: new Map(
    [builtinPack, bpmnPack, sketchPack, ...vendoredPacks].map((pack) => [pack.meta.id, pack]),
  ),
};
