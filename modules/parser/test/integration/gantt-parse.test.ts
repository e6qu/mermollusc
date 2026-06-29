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
        start: { kind: "after", refs: ["r1"] },
        milestone: false,
        durationDays: 7, // 1w
      },
      {
        id: "i1",
        label: "Implement",
        section: "Build",
        status: "normal",
        start: { kind: "after", refs: ["d1"] },
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

  it("tracks the full start field for explicit dates and `after` dependencies", () => {
    const text = "gantt\n  A : a, 2024-01-01, 2d\n  B : b, after a, 3d\n";
    const r = parseGanttWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const a = r.value.ast.tasks[0]?.id;
    const b = r.value.ast.tasks[1]?.id;
    if (a === undefined || b === undefined) throw new Error("gantt source span test setup failed");
    const aField = r.value.source.taskStartField.get(a);
    const bField = r.value.source.taskStartField.get(b);
    const aDate = r.value.source.taskStart.get(a);
    expect(aField).toBeDefined();
    expect(bField).toBeDefined();
    expect(aDate).toBeDefined();
    if (aField !== undefined) expect(text.slice(aField.start, aField.end)).toBe("2024-01-01");
    if (bField !== undefined) expect(text.slice(bField.start, bField.end)).toBe("after a");
    if (aDate !== undefined) expect(text.slice(aDate.start, aDate.end)).toBe("2024-01-01");
    expect(r.value.source.taskStart.get(b)).toBeUndefined();
  });

  it("fails loudly when a task is missing a start or duration", () => {
    expect(isOk(parseGantt("gantt\n  Lonely : 5d\n"))).toBe(false);
  });

  it("fails loudly on an unparseable duration", () => {
    expect(isOk(parseGantt("gantt\n  Bad : 2024-01-01, soon\n"))).toBe(false);
  });

  it("parses a `tickInterval` directive into days (week → 7), defaulting to weekly", () => {
    const r = parseGantt("gantt\n  tickInterval 2weeks\n  A : a, 2024-01-01, 2d\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.tickIntervalDays).toBe(14);

    const d = parseGantt("gantt\n  A : a, 2024-01-01, 2d\n");
    expect(isOk(d) && d.value.tickIntervalDays).toBe(7); // default when absent
  });

  it("fails loudly on an invalid `tickInterval` (e.g. an unsupported unit)", () => {
    expect(isOk(parseGantt("gantt\n  tickInterval 1month\n  A : a, 2024-01-01, 2d\n"))).toBe(false);
    expect(isOk(parseGantt("gantt\n  tickInterval soon\n  A : a, 2024-01-01, 2d\n"))).toBe(false);
  });

  it("fails loudly on an invalid task start date (bad format or non-calendar day)", () => {
    expect(isOk(parseGantt("gantt\n  A : a, 01/02/2024, 2d\n"))).toBe(false); // not ISO
    expect(isOk(parseGantt("gantt\n  A : a, 2024-13-01, 2d\n"))).toBe(false); // month 13
    expect(isOk(parseGantt("gantt\n  A : a, 2024-02-31, 2d\n"))).toBe(false); // Feb 31 rolls over
  });

  it("fails loudly on an invalid excluded date", () => {
    expect(isOk(parseGantt("gantt\n  excludes 2024-02-31\n  A : a, 2024-01-01, 2d\n"))).toBe(false);
  });

  it("parses an `excludes` directive into weekends + holiday dates", () => {
    const r = parseGantt("gantt\n  excludes weekends 2024-01-15, 2024-12-25\n  A : a, 2024-01-01, 2d\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.excludesWeekends).toBe(true);
    expect(r.value.excludeDates).toEqual(["2024-01-15", "2024-12-25"]);
  });

  it("defaults to no exclusions when there's no `excludes` directive", () => {
    const r = parseGantt("gantt\n  A : a, 2024-01-01, 2d\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.excludesWeekends).toBe(false);
    expect(r.value.excludeDates).toEqual([]);
  });

  it("parses several `after` refs into a non-empty list of predecessors", () => {
    const r = parseGantt("gantt\n  A : a, 2024-01-01, 2d\n  B : b, 2024-01-01, 3d\n  C : c, after a b, 1d\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.tasks[2]?.start).toEqual({ kind: "after", refs: ["a", "b"] });
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
