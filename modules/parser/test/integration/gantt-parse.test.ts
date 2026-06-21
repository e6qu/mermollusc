import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseGantt, parseGanttWithSource } from "../../src/shell/gantt-parse.js";

describe("parseGantt", () => {
  it("parses title, dateFormat, sections, and tasks with their meta", () => {
    const text = [
      "gantt",
      "  title Project Plan",
      "  dateFormat YYYY-MM-DD",
      "  section Planning",
      "    Research :done, r1, 2024-01-01, 5d",
      "    Design   :active, d1, after r1, 1w",
      "  section Build",
      "    Implement :i1, after d1, 14d",
      "    Bare task : 2024-02-01, 3d",
      "",
    ].join("\n");
    const r = parseGantt(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.kind).toBe("gantt");
    expect(r.value.title).toBe("Project Plan");
    expect(r.value.dateFormat).toBe("YYYY-MM-DD");
    expect(r.value.tasks).toEqual([
      {
        id: "r1",
        label: "Research",
        section: "Planning",
        status: "done",
        start: { kind: "date", date: "2024-01-01" },
        milestone: false,
        durationDays: 5,
      },
      {
        id: "d1",
        label: "Design",
        section: "Planning",
        status: "active",
        start: { kind: "after", ref: "r1" },
        milestone: false,
        durationDays: 7, // 1w
      },
      {
        id: "i1",
        label: "Implement",
        section: "Build",
        status: "normal",
        start: { kind: "after", ref: "d1" },
        milestone: false,
        durationDays: 14,
      },
      {
        id: "t3", // no explicit id → auto-numbered by task index
        label: "Bare task",
        section: "Build",
        status: "normal",
        start: { kind: "date", date: "2024-02-01" },
        milestone: false,
        durationDays: 3,
      },
    ]);
  });

  it("treats a bare number duration as days and tracks the label span for editing", () => {
    const text = "gantt\n  A task : 2024-01-01, 4\n";
    const r = parseGanttWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.tasks[0]?.durationDays).toBe(4);
    // the span covers exactly "A task" (the text before the colon, trimmed)
    const span = r.value.source.tasks.get(r.value.ast.tasks[0]?.id ?? ("x" as never));
    expect(span).toBeDefined();
    if (span !== undefined) expect(text.slice(span.start, span.end)).toBe("A task");
  });

  it("fails loudly when a task is missing a start or duration", () => {
    expect(isOk(parseGantt("gantt\n  Lonely : 5d\n"))).toBe(false);
  });

  it("fails loudly on an unparseable duration", () => {
    expect(isOk(parseGantt("gantt\n  Bad : 2024-01-01, soon\n"))).toBe(false);
  });

  it("parses a `milestone` task (0d) as a point and normalises its duration to 0", () => {
    const r = parseGantt("gantt\n  Launch : milestone, ms, 2024-03-01, 0d\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.tasks[0]).toEqual({
      id: "ms",
      label: "Launch",
      section: null,
      status: "normal",
      start: { kind: "date", date: "2024-03-01" },
      milestone: true,
      durationDays: 0,
    });
  });

  it("rejects a 0d duration on an ordinary (non-milestone) task", () => {
    expect(isOk(parseGantt("gantt\n  Task : 2024-01-01, 0d\n"))).toBe(false);
  });

  it("parses an empty gantt (header only)", () => {
    const r = parseGantt("gantt\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.tasks).toEqual([]);
    expect(r.value.title).toBeNull();
  });
});
