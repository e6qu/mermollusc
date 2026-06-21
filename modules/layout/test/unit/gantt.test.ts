import { brand } from "@m/std";
import type { GanttAst, GanttTask } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutGantt } from "../../src/core/gantt.js";

const tid = (s: string) => brand<string, "GanttTaskId">(s);

const task = (over: Partial<GanttTask> & Pick<GanttTask, "id" | "start" | "durationDays">): GanttTask => ({
  label: over.label ?? "Task",
  section: over.section ?? null,
  status: over.status ?? "normal",
  ...over,
});

const ast = (tasks: readonly GanttTask[]): GanttAst => ({
  kind: "gantt",
  title: null,
  dateFormat: "YYYY-MM-DD",
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
    // A starts on the earliest day → x 0; B starts 2 days later → x 2*16=32.
    expect(a?.bounds.origin.x).toBe(0);
    expect(b?.bounds.origin.x).toBe(32);
    // widths scale with duration (≥ the label's measured width); B's row is below A's.
    expect(a?.bounds.size.width).toBeGreaterThanOrEqual(2 * 16);
    expect((b?.bounds.origin.y ?? 0) > (a?.bounds.origin.y ?? 0)).toBe(true);
    expect(r.value.edges).toEqual([]); // `after` is positional, not a drawn arrow
  });

  it("chains an `after` task off the referenced task's end", () => {
    const r = layoutGantt(
      ast([
        task({ id: tid("a"), start: { kind: "date", date: "2024-01-01" }, durationDays: 3 }),
        task({ id: tid("b"), start: { kind: "after", ref: tid("a") }, durationDays: 2 }),
      ]),
      heuristicMeasure,
    );
    if (!r.ok) throw new Error(r.error.message);
    // A spans days 0..3, so B (after A) starts on day 3 → x = 3 days * 16 = 48.
    expect(r.value.nodes[1]?.bounds.origin.x).toBe(48);
  });

  it("fails loudly on an `after` reference to an unknown task", () => {
    const r = layoutGantt(
      ast([task({ id: tid("a"), start: { kind: "after", ref: tid("ghost") }, durationDays: 1 })]),
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

  it("returns an empty scene for a task-less gantt", () => {
    const r = layoutGantt(ast([]), heuristicMeasure);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.nodes).toEqual([]);
  });
});
