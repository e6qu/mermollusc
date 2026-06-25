import fc from "fast-check";
import { patchSpan, validateLabel } from "@m/builder";
import {
  parseErWithSource,
  parseGanttWithSource,
  parseTimelineWithSource,
} from "@m/parser";
import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";

// The colon-delimited families (timeline period/event, gantt task) split their line on `:`. A relabel
// that injected a `:` used to silently restructure the diagram (one event → two). The app now validates
// these labels with the `colon` context. This fuzz mirrors that: any label the `colon` rule ACCEPTS,
// spliced into the label span, must re-parse to the SAME number of events/tasks (no hidden split), and
// any label it REJECTS must contain a `:` or newline.

// Non-blank labels: an empty relabel legitimately clears the event/task (a separate concern), so the
// "structure is preserved" invariant is about delimiter injection, not deletion.
const labelArb = fc.string({ maxLength: 12 }).filter((s) => s.trim().length > 0);

describe("label-edit fuzz — the colon context keeps timeline/gantt structurally intact", () => {
  it("timeline: an accepted event relabel never splits one event into two", () => {
    fc.assert(
      fc.property(labelArb, (label) => {
        const seed = "timeline\n  2001 : Alpha\n  2002 : Beta\n";
        const parsed = parseTimelineWithSource(seed);
        if (!isOk(parsed)) throw new Error("seed must parse");
        const before = parsed.value.source.events.size;
        const span = [...parsed.value.source.events.values()][0];
        if (span === undefined) throw new Error("seed must expose an event span");

        const checked = validateLabel(label, "colon");
        if (!isOk(checked)) {
          expect(label.includes(":") || label.includes("\n") || label.includes("%%")).toBe(true);
          return;
        }
        const next = parseTimelineWithSource(patchSpan(seed, span, label));
        expect(isOk(next)).toBe(true);
        if (isOk(next)) expect(next.value.source.events.size).toBe(before);
      }),
      { numRuns: 300 },
    );
  });

  it("gantt: an accepted task relabel never spawns a spurious meta field", () => {
    fc.assert(
      fc.property(labelArb, (label) => {
        const seed = "gantt\n  title T\n  section S\n  Design : a, 2014-01-01, 3d\n";
        const parsed = parseGanttWithSource(seed);
        if (!isOk(parsed)) throw new Error("seed must parse");
        const before = parsed.value.source.tasks.size;
        const span = [...parsed.value.source.tasks.values()][0];
        if (span === undefined) throw new Error("seed must expose a task span");

        const checked = validateLabel(label, "colon");
        if (!isOk(checked)) {
          expect(label.includes(":") || label.includes("\n") || label.includes("%%")).toBe(true);
          return;
        }
        const next = parseGanttWithSource(patchSpan(seed, span, label));
        expect(isOk(next)).toBe(true);
        if (isOk(next)) expect(next.value.source.tasks.size).toBe(before);
      }),
      { numRuns: 300 },
    );
  });

  it("er: a quoted relationship label round-trips through its (quote-excluding) edit span", () => {
    const seed = 'erDiagram\n  A ||--o{ B : "places many"\n';
    const parsed = parseErWithSource(seed);
    if (!isOk(parsed)) throw new Error("seed must parse");
    const span = [...parsed.value.source.relationships.values()][0];
    expect(span).toBeDefined();
    if (span === undefined) return;
    // The span excludes the quotes, so renaming replaces only the inner text and the quotes survive.
    const renamed = patchSpan(seed, span, "owns");
    expect(renamed).toContain('"owns"');
    const reparsed = parseErWithSource(renamed);
    expect(isOk(reparsed)).toBe(true);
    if (isOk(reparsed)) expect(reparsed.value.ast.relationships[0]?.label).toBe("owns");
  });
});
