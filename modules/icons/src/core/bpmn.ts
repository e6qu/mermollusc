import type { IconPack } from "./registry.js";

// Original BPMN-2.0-notation glyphs authored here under the repo's AGPL license (BPMN is an open OMG
// notation; no third-party asset is vendored). Outlined shapes (stroke, no fill) so the notation — thin
// vs thick event rings, gateway markers, task corner markers — stays legible at small sizes. 24×24,
// names follow BPMN terms. Events are composed from a ring (thin = start, double = intermediate/boundary,
// thick = end) and an optional trigger symbol, so the whole event matrix stays consistent.

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${body}</svg>`;

// Event rings. The thick (end) ring carries its own stroke-width so it reads as the "throw/end" weight.
const RING_THIN = '<circle cx="12" cy="12" r="9"/>';
const RING_DOUBLE = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6.8"/>';
const RING_THICK = '<circle cx="12" cy="12" r="8.4" stroke-width="2.6"/>';

// Trigger symbols, sized to sit inside an event ring (≈ r6).
const TRIGGER = {
  message: '<path d="M7.7 9.6h8.6v4.8H7.7z"/><path d="M7.7 9.6l4.3 3.1 4.3-3.1"/>',
  timer: '<circle cx="12" cy="12.3" r="4.4"/><path d="M12 9.1v3.2l2.1 1.3"/>',
  signal: '<path d="M12 8.1l4.3 7.5H7.7z"/>',
  error: '<path d="M8.6 15.6l2.1-5 1.8 2 2.9-4.4-2.1 5-1.8-2z"/>',
  escalation: '<path d="M12 8l3.6 7.2L12 12.4l-3.6 2.8z"/>',
  conditional:
    '<rect x="8.4" y="8.4" width="7.2" height="7.2"/><path d="M10 10.7h4M10 12h4M10 13.3h4"/>',
  link: '<path d="M8 12h6m-2.4-2.4L14 12l-2.4 2.4"/>',
  terminate: '<circle cx="12" cy="12" r="4.8" fill="currentColor"/>',
} as const;

const event = (ring: string, trigger: string): string => svg(`${ring}${trigger}`);

// A task is a rounded rectangle; type markers sit small in the top-left corner.
const TASK_BODY = '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/>';
const task = (marker: string): string => svg(`${TASK_BODY}${marker}`);

const ICONS = new Map<string, string>([
  // — Events (none) —
  ["start-event", event(RING_THIN, "")],
  ["intermediate-event", event(RING_DOUBLE, "")],
  ["end-event", svg(RING_THICK)],
  // — Start events (typed) —
  ["start-message", event(RING_THIN, TRIGGER.message)],
  ["start-timer", event(RING_THIN, TRIGGER.timer)],
  ["start-signal", event(RING_THIN, TRIGGER.signal)],
  ["start-conditional", event(RING_THIN, TRIGGER.conditional)],
  ["start-escalation", event(RING_THIN, TRIGGER.escalation)],
  // — Intermediate / boundary events (typed) —
  ["intermediate-message", event(RING_DOUBLE, TRIGGER.message)],
  ["intermediate-timer", event(RING_DOUBLE, TRIGGER.timer)],
  ["intermediate-signal", event(RING_DOUBLE, TRIGGER.signal)],
  ["intermediate-error", event(RING_DOUBLE, TRIGGER.error)],
  ["intermediate-escalation", event(RING_DOUBLE, TRIGGER.escalation)],
  ["intermediate-link", event(RING_DOUBLE, TRIGGER.link)],
  ["intermediate-conditional", event(RING_DOUBLE, TRIGGER.conditional)],
  // — End events (typed) —
  ["end-message", event(RING_THICK, TRIGGER.message)],
  ["end-signal", event(RING_THICK, TRIGGER.signal)],
  ["end-error", event(RING_THICK, TRIGGER.error)],
  ["end-escalation", event(RING_THICK, TRIGGER.escalation)],
  ["end-terminate", event(RING_THICK, TRIGGER.terminate)],
  // — Generic event symbols (kept for back-compat / quick use) —
  ["message-event", event(RING_THIN, TRIGGER.message)],
  ["timer-event", event(RING_THIN, TRIGGER.timer)],
  // — Activities —
  ["task", task("")],
  [
    "user-task",
    task('<circle cx="6.2" cy="8.8" r="1.5"/><path d="M3.9 13.2a2.3 2.3 0 0 1 4.6 0"/>'),
  ],
  [
    "service-task",
    task(
      '<circle cx="6.3" cy="9.5" r="1.7"/><path d="M6.3 7.2v-1M6.3 11.8v1M8.6 9.5h1M3 9.5h1M7.95 7.85l.7-.7M3.95 11.85l.7-.7M7.95 11.15l.7.7M3.95 7.15l.7.7"/>',
    ),
  ],
  [
    "script-task",
    task(
      '<path d="M4.4 7.4c.8 0 1 .8 1.9.8s1-.8 1.9-.8v5.4c-.9 0-1 .8-1.9.8s-1.1-.8-1.9-.8z"/><path d="M5.4 9.2h2M5.4 10.6h2"/>',
    ),
  ],
  [
    "manual-task",
    task(
      '<path d="M4 11.5l1.8-.4v-2a.6.6 0 0 1 1.2 0v1.7l.5-.1a.5.5 0 0 1 .6.5v2a1.8 1.8 0 0 1-1.8 1.5H6a1.6 1.6 0 0 1-1.4-.9l-.6-1z"/>',
    ),
  ],
  [
    "send-task",
    task('<path d="M3.8 7.6h5.6v3.8H3.8z" fill="currentColor"/><path d="M3.8 7.6l2.8 2 2.8-2"/>'),
  ],
  [
    "receive-task",
    task('<rect x="3.8" y="7.6" width="5.6" height="3.8"/><path d="M3.8 7.6l2.8 2 2.8-2"/>'),
  ],
  [
    "business-rule-task",
    task('<rect x="3.9" y="7.5" width="5.4" height="4.6"/><path d="M3.9 9.1h5.4M6.6 9.1v3"/>'),
  ],
  [
    "subprocess",
    svg(
      `${TASK_BODY}<rect x="10" y="13.5" width="4" height="4"/><path d="M12 14.2v2.6M10.7 15.5h2.6"/>`,
    ),
  ],
  [
    "call-activity",
    svg('<rect x="2.5" y="5.5" width="19" height="13" rx="2.5" stroke-width="2.6"/>'),
  ],
  ["transaction", svg(`${TASK_BODY}<rect x="4" y="7" width="16" height="10" rx="1.5"/>`)],
  // — Gateways —
  ["exclusive-gateway", svg('<path d="M12 3l9 9-9 9-9-9z"/><path d="M9 9l6 6M15 9l-6 6"/>')],
  ["parallel-gateway", svg('<path d="M12 3l9 9-9 9-9-9z"/><path d="M12 8v8M8 12h8"/>')],
  ["inclusive-gateway", svg('<path d="M12 3l9 9-9 9-9-9z"/><circle cx="12" cy="12" r="3.5"/>')],
  [
    "complex-gateway",
    svg(
      '<path d="M12 3l9 9-9 9-9-9z"/><path d="M12 7.5v9M7.5 12h9M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4"/>',
    ),
  ],
  [
    "event-gateway",
    svg(
      '<path d="M12 3l9 9-9 9-9-9z"/><circle cx="12" cy="12" r="4.5"/><path d="M12 8.4l3.1 5.4H8.9z"/>',
    ),
  ],
  // — Data —
  ["data-object", svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>')],
  [
    "data-store",
    svg(
      '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/>',
    ),
  ],
  [
    "data-input",
    svg(
      '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M8 12h5m-2.2-2.2L13 12l-2.2 2.2"/>',
    ),
  ],
  [
    "data-output",
    svg(
      '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M8 12h5m-2.2-2.2L13 12l-2.2 2.2" fill="currentColor"/>',
    ),
  ],
  [
    "data-collection",
    svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 16v3M11 16v3M13 16v3"/>'),
  ],
  // — Artifacts / containers —
  ["group", svg('<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2"/>')],
  ["annotation", svg('<path d="M9 4H5v16h4"/><path d="M12 8h6M12 12h6M12 16h4"/>')],
  ["pool", svg('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 4v16"/>')],
  ["lane", svg('<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M7 7v10"/>')],
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
    [
      "event",
      [
        "start-event",
        "start-message",
        "start-timer",
        "start-signal",
        "start-conditional",
        "start-escalation",
        "intermediate-event",
        "intermediate-message",
        "intermediate-timer",
        "intermediate-signal",
        "intermediate-error",
        "intermediate-escalation",
        "intermediate-link",
        "intermediate-conditional",
        "end-event",
        "end-message",
        "end-signal",
        "end-error",
        "end-escalation",
        "end-terminate",
        "message-event",
        "timer-event",
      ],
    ],
    [
      "activity",
      [
        "task",
        "user-task",
        "service-task",
        "script-task",
        "manual-task",
        "send-task",
        "receive-task",
        "business-rule-task",
        "subprocess",
        "call-activity",
        "transaction",
      ],
    ],
    [
      "gateway",
      [
        "exclusive-gateway",
        "parallel-gateway",
        "inclusive-gateway",
        "complex-gateway",
        "event-gateway",
      ],
    ],
    ["data", ["data-object", "data-store", "data-input", "data-output", "data-collection"]],
    ["artifact", ["group", "annotation", "pool", "lane"]],
  ]),
};
