import { brand, oneOrMore } from "@m/std";
import type { GanttStart, GanttTask, GanttTaskId, GanttAst } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutGantt } from "../../src/core/gantt.js";

const tid = (s: string) => brand<string, "GanttTaskId">(s);
const aft = (first: GanttTaskId, ...rest: readonly GanttTaskId[]): GanttStart => ({
  kind: "after",
  refs: oneOrMore(first, ...rest),
});

const task = (over: Partial<GanttTask> & Pick<GanttTask, "id" | "start" | "durationDays">): GanttTask => ({
  label: over.label ?? "Task",
  section: over.section ?? null,
  status: over.status ?? "normal",
  milestone: over.milestone ?? false,
  ...over,
});

const ast = (
  tasks: readonly GanttTask[],
  excludes: Pick<GanttAst, "excludesWeekends" | "excludeDates"> = {
    excludesWeekends: false,
    excludeDates: [],
  },
): GanttAst => ({
  kind: "gantt",
  title: null,
  dateFormat: "YYYY-MM-DD",
  excludesWeekends: excludes.excludesWeekends,
  excludeDates: excludes.excludeDates,
  tasks,
});

describe("layoutGantt", () => {
  it("places each task as a bar — x by start day, width by duration, one row each", () => {
    const r = layoutGantt(
      ast([
        task({ id: tid("a"), label: "A", start: { kind: "date", date: "2024-01-01" }, durationDays: 2 }),
        task({ id: tid("b"), label: "B", start: { kind: "date", date: "2024-01-03" }, durationDays: 4 }),
      ]),
      heuristicMeasure,
    );
    if (!r.ok) throw new Error(r.error.message);
    const [a, b] = r.value.nodes;
    // bars sit past a fixed left gutter; B starts 2 days after A → 2*16=32 px further right.
    expect((b?.bounds.origin.x ?? 0) - (a?.bounds.origin.x ?? 0)).toBe(32);
    // widths scale with duration (≥ the label's measured width); B's row is below A's.
    expect(a?.bounds.size.width).toBeGreaterThanOrEqual(2 * 16);
    expect((b?.bounds.origin.y ?? 0) > (a?.bounds.origin.y ?? 0)).toBe(true);
    expect(r.value.edges).toEqual([]); // `after` is positional, not a drawn arrow
  });

  it("chains an `after` task off the referenced task's end", () => {
    const r = layoutGantt(
      ast([
        task({ id: tid("a"), start: { kind: "date", date: "2024-01-01" }, durationDays: 3 }),
        task({ id: tid("b"), start: aft(tid("a")), durationDays: 2 }),
      ]),
      heuristicMeasure,
    );
    if (!r.ok) throw new Error(r.error.message);
    // A spans days 0..3, so B (after A) starts on day 3 → 3 days * 16 = 48 px past A's start.
    const ax = r.value.nodes[0]?.bounds.origin.x ?? 0;
    expect((r.value.nodes[1]?.bounds.origin.x ?? 0) - ax).toBe(48);
  });

  it("starts a multi-`after` task at the latest predecessor's end", () => {
    const r = layoutGantt(
      ast([
        task({ id: tid("a"), start: { kind: "date", date: "2024-01-01" }, durationDays: 2 }),
        task({ id: tid("b"), start: { kind: "date", date: "2024-01-01" }, durationDays: 6 }),
        // c waits on both a (ends day 2) and b (ends day 6) → starts on day 6, the later end.
        task({ id: tid("c"), start: aft(tid("a"), tid("b")), durationDays: 1 }),
      ]),
      heuristicMeasure,
    );
    if (!r.ok) throw new Error(r.error.message);
    const ax = r.value.nodes[0]?.bounds.origin.x ?? 0;
    // c starts on day 6 → 6 days * 16 = 96 px past the day-0 start (a/b both start on day 0).
    expect((r.value.nodes[2]?.bounds.origin.x ?? 0) - ax).toBe(96);
  });

  it("fails loudly when any one of several `after` refs is unknown", () => {
    const r = layoutGantt(
      ast([
        task({ id: tid("a"), start: { kind: "date", date: "2024-01-01" }, durationDays: 2 }),
        task({ id: tid("b"), start: aft(tid("a"), tid("ghost")), durationDays: 1 }),
      ]),
      heuristicMeasure,
    );
    expect(r.ok).toBe(false);
  });

  it("fails loudly on an `after` reference to an unknown task", () => {
    const r = layoutGantt(
      ast([task({ id: tid("a"), start: aft(tid("ghost")), durationDays: 1 })]),
      heuristicMeasure,
    );
    expect(r.ok).toBe(false);
  });

  it("with `excludes weekends`, a bar stretches across the skipped weekend days", () => {
    // 2024-01-04 is a Thursday; 5 working days spill across Sat+Sun into the next week.
    const tasks = [
      task({ id: tid("a"), label: "T", start: { kind: "date", date: "2024-01-04" }, durationDays: 5 }),
    ];
    const plain = layoutGantt(ast(tasks), heuristicMeasure);
    const excl = layoutGantt(
      ast(tasks, { excludesWeekends: true, excludeDates: [] }),
      heuristicMeasure,
    );
    if (!plain.ok) throw new Error(plain.error.message);
    if (!excl.ok) throw new Error(excl.error.message);
    // 5 calendar days normally; 7 with the weekend skipped → 2 extra days * 16 px.
    const dw = (excl.value.nodes[0]?.bounds.size.width ?? 0) - (plain.value.nodes[0]?.bounds.size.width ?? 0);
    expect(dw).toBe(2 * 16);
  });

  it("with `excludes weekends`, a start landing on a weekend shifts to the next working day", () => {
    const tasks = [
      task({ id: tid("a"), label: "A", start: { kind: "date", date: "2024-01-01" }, durationDays: 1 }), // Mon, anchors minDay
      task({ id: tid("b"), label: "B", start: { kind: "date", date: "2024-01-06" }, durationDays: 1 }), // Sat → shifts to Mon 01-08
    ];
    const r = layoutGantt(ast(tasks, { excludesWeekends: true, excludeDates: [] }), heuristicMeasure);
    if (!r.ok) throw new Error(r.error.message);
    // minDay is Mon 01-01; B shifts from Sat (day+5) to Mon (day+7) → 7 * 16 px past A's start.
    const ax = r.value.nodes[0]?.bounds.origin.x ?? 0;
    expect((r.value.nodes[1]?.bounds.origin.x ?? 0) - ax).toBe(7 * 16);
  });

  it("treats an `excludes <date>` holiday as a non-working day", () => {
    // 2024-01-01 is a Monday; 2024-01-02 (Tuesday) is a declared holiday.
    const tasks = [
      task({ id: tid("a"), label: "T", start: { kind: "date", date: "2024-01-01" }, durationDays: 3 }),
    ];
    const r = layoutGantt(
      ast(tasks, { excludesWeekends: false, excludeDates: ["2024-01-02"] }),
      heuristicMeasure,
    );
    if (!r.ok) throw new Error(r.error.message);
    // Mon worked, Tue skipped, Wed+Thu worked → 3 working days span 4 calendar days.
    expect(r.value.nodes[0]?.bounds.size.width ?? 0).toBe(4 * 16);
  });

  it("fails loudly on an unparseable excluded date", () => {
    const tasks = [task({ id: tid("a"), start: { kind: "date", date: "2024-01-01" }, durationDays: 1 })];
    const r = layoutGantt(
      ast(tasks, { excludesWeekends: false, excludeDates: ["01/02/2024"] }),
      heuristicMeasure,
    );
    expect(r.ok).toBe(false);
  });

  it("fails loudly on a non-ISO date", () => {
    const r = layoutGantt(
      ast([task({ id: tid("a"), start: { kind: "date", date: "01/02/2024" }, durationDays: 1 })]),
      heuristicMeasure,
    );
    expect(r.ok).toBe(false);
  });

  it("widens a short bar to fit its label", () => {
    const r = layoutGantt(
      ast([
        task({
          id: tid("a"),
          label: "A very long task label",
          start: { kind: "date", date: "2024-01-01" },
          durationDays: 1,
        }),
      ]),
      heuristicMeasure,
    );
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.nodes[0]?.bounds.size.width ?? 0).toBeGreaterThan(1 * 16);
  });

  it("renders a milestone as a diamond centred on its date, not a bar", () => {
    const r = layoutGantt(
      ast([
        task({ id: tid("a"), start: { kind: "date", date: "2024-01-01" }, durationDays: 5 }),
        task({
          id: tid("m"),
          label: "Launch",
          milestone: true,
          start: aft(tid("a")),
          durationDays: 0,
        }),
      ]),
      heuristicMeasure,
    );
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.nodes[0]?.shape).toBe("rect"); // the ordinary task is a bar
    expect(r.value.nodes[1]?.shape).toBe("diamond"); // the milestone is a diamond
  });

  it("returns an empty scene for a task-less gantt", () => {
    const r = layoutGantt(ast([]), heuristicMeasure);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.nodes).toEqual([]);
    expect(r.value.decorations).toEqual([]);
  });

  it("emits axis decorations: a weekly gridline + date caption, and a caption per section", () => {
    const r = layoutGantt(
      ast([
        task({ id: tid("a"), section: "Plan", start: { kind: "date", date: "2024-01-01" }, durationDays: 10 }),
        task({ id: tid("b"), section: "Build", start: aft(tid("a")), durationDays: 3 }),
      ]),
      heuristicMeasure,
    );
    if (!r.ok) throw new Error(r.error.message);
    const rules = r.value.decorations.filter((d) => d.kind === "rule");
    const captions = r.value.decorations.filter((d) => d.kind === "caption");
    // span is 13 days → weekly gridlines at day 0 and day 7 (two ticks).
    expect(rules).toHaveLength(2);
    // the first date caption is the chart's start date; the section names appear as captions too.
    const texts = captions.map((c) => (c.kind === "caption" ? c.text : ""));
    expect(texts).toContain("2024-01-01");
    expect(texts).toContain("Plan");
    expect(texts).toContain("Build");
  });
});
