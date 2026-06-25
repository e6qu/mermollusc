import fc from "fast-check";
import { deleteLineAt, deleteTimelineEvent } from "@m/builder";
import type { TextSpan } from "@m/contracts";
import { parseDiagram, parseDiagramWithSource } from "@m/parser";
import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";

// A span-keyed family deletes each item by its source span, so the app sorts a multi-delete bottom-up
// (highest offset first) to keep every not-yet-applied span valid. This fuzzes that invariant: applying
// the family's deletes to an arbitrary subset, in that order, must always leave parseable text — never a
// half-spliced line. (Regression net for the pie/timeline/mindmap multi-delete corruption.)

const PIE = 'pie\n  title T\n  "Alpha" : 10\n  "Beta" : 20\n  "Gamma" : 30\n  "Delta" : 40\n';
const GANTT =
  "gantt\n  title T\n  dateFormat YYYY-MM-DD\n  section S\n    A :a, 2024-01-01, 2d\n    B :b, after a, 2d\n    C :c, after b, 2d\n    D :d, after c, 2d\n";
const TIMELINE = "timeline\n  title T\n  P1 : Alpha : Beta\n  P2 : Gamma\n  P3 : Delta : Epsilon\n";

// Drop a random subset of spans, applying each delete in descending span order (the app's rule), then
// assert the remaining source still parses.
const fuzzDeletes = (
  text: string,
  spans: readonly TextSpan[],
  del: (text: string, span: TextSpan) => string,
): void => {
  fc.assert(
    fc.property(fc.subarray([...spans.keys()]), (pick) => {
      const chosen = pick
        .map((i) => spans[i])
        .filter((s): s is TextSpan => s !== undefined)
        .sort((a, b) => b.start - a.start);
      let out = text;
      for (const span of chosen) out = del(out, span);
      expect(isOk(parseDiagram(out))).toBe(true);
    }),
    { numRuns: 300 },
  );
};

describe("multi-delete fuzz — span-keyed families stay parseable", () => {
  it("pie: any subset of slices", () => {
    const parsed = parseDiagramWithSource(PIE);
    if (!isOk(parsed) || parsed.value.family !== "pie") throw new Error("pie setup");
    fuzzDeletes(PIE, [...parsed.value.source.slices.values()], deleteLineAt);
  });

  it("gantt: any subset of tasks", () => {
    const parsed = parseDiagramWithSource(GANTT);
    if (!isOk(parsed) || parsed.value.family !== "gantt") throw new Error("gantt setup");
    fuzzDeletes(GANTT, [...parsed.value.source.tasks.values()], deleteLineAt);
  });

  it("timeline: any subset of events", () => {
    const parsed = parseDiagramWithSource(TIMELINE);
    if (!isOk(parsed) || parsed.value.family !== "timeline") throw new Error("timeline setup");
    const source = parsed.value.source;
    fuzzDeletes(TIMELINE, [...source.events.values()], (t, span) => {
      for (const [id, s] of source.events) {
        if (s.start === span.start) return deleteTimelineEvent(t, source, id);
      }
      return t;
    });
  });
});
