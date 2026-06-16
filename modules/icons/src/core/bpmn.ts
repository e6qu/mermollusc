import type { IconPack } from "./registry.js";

// Original BPMN-notation glyphs authored here under the repo's AGPL license (BPMN is an open OMG
// notation; no third-party asset is vendored). Outlined shapes (stroke, no fill) so the notation —
// thin vs thick event rings, gateway markers — stays legible. 24×24, names follow BPMN terms.
const ICONS = new Map<string, string>([
  [
    "start-event",
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><circle cx="12" cy="12" r="9"/></svg>',
  ],
  [
    "end-event",
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="3"><circle cx="12" cy="12" r="8.5"/></svg>',
  ],
  [
    "intermediate-event",
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6.5"/></svg>',
  ],
  [
    "message-event",
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><rect x="7.5" y="9" width="9" height="6"/><path d="M7.5 9l4.5 3.5L16.5 9"/></svg>',
  ],
  [
    "timer-event",
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v4.5l3 2"/></svg>',
  ],
  [
    "task",
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/></svg>',
  ],
  [
    "subprocess",
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M12 12.5v4M10 14.5h4"/></svg>',
  ],
  [
    "exclusive-gateway",
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><path d="M12 3l9 9-9 9-9-9z"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  ],
  [
    "parallel-gateway",
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><path d="M12 3l9 9-9 9-9-9z"/><path d="M12 8v8M8 12h8"/></svg>',
  ],
  [
    "inclusive-gateway",
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><path d="M12 3l9 9-9 9-9-9z"/><circle cx="12" cy="12" r="3.5"/></svg>',
  ],
  [
    "data-object",
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
  ],
  [
    "data-store",
    '<svg viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/></svg>',
  ],
]);

export const bpmnPack: IconPack = {
  meta: {
    id: "bpmn",
    license: "AGPL-3.0-or-later",
    source: "built-in (mermollusc)",
    version: "0.0.0",
  },
  icons: ICONS,
  categories: new Map<string, readonly string[]>([
    ["event", ["start-event", "end-event", "intermediate-event", "message-event", "timer-event"]],
    ["activity", ["task", "subprocess"]],
    ["gateway", ["exclusive-gateway", "parallel-gateway", "inclusive-gateway"]],
    ["data", ["data-object", "data-store"]],
  ]),
};
