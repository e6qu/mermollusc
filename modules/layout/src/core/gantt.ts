import { err, ok, rect, type Result } from "@m/std";
import { sceneNodeId } from "@m/contracts";
import type { GanttAst, GanttStatus, NodeAccent, Scene, SceneNode } from "@m/contracts";
import type { LayoutError, MeasureText } from "./graph.js";

// A task's status maps to a fill accent the renderer colours: done is muted, active highlighted, crit
// flagged; a normal task takes the ordinary fill (`none`).
const STATUS_ACCENT: Record<GanttStatus, NodeAccent> = {
  normal: "none",
  done: "muted",
  active: "active",
  crit: "danger",
};

const DAY_WIDTH = 16; // px per day on the time axis
const ROW_HEIGHT = 30;
const BAR_HEIGHT = 22;
const LABEL_PAD = 12;

// Parse an ISO `YYYY-MM-DD` date to a whole-day number (days since the epoch, UTC so it's
// timezone-stable). The Gantt subset assumes ISO dates; other `dateFormat`s aren't resolved yet.
const parseDay = (date: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (m === null) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
};

// Pure timeline layout: each task is a horizontal bar on a day axis — x by its start day, width by its
// duration, one row per task in document order. `after` starts chain off the referenced task's end
// (resolved in order, so a task can only follow one declared before it). Bars are widened to fit their
// label so the text stays readable. No edges — `after` is positional, not a drawn dependency arrow.
export const layoutGantt = (ast: GanttAst, measure: MeasureText): Result<Scene, LayoutError> => {
  const ends = new Map<string, number>();
  const placed: Array<{
    readonly id: string;
    readonly label: string;
    readonly accent: NodeAccent;
    readonly startDay: number;
    readonly endDay: number;
  }> = [];

  for (const task of ast.tasks) {
    let startDay: number;
    if (task.start.kind === "date") {
      const day = parseDay(task.start.date);
      if (day === null) {
        return err({
          kind: "layout",
          message: `gantt: task "${task.label}" has an unparseable date "${task.start.date}" (expected YYYY-MM-DD)`,
        });
      }
      startDay = day;
    } else {
      const predEnd = ends.get(task.start.ref);
      if (predEnd === undefined) {
        return err({
          kind: "layout",
          message: `gantt: task "${task.label}" starts after unknown task "${task.start.ref}"`,
        });
      }
      startDay = predEnd;
    }
    const endDay = startDay + task.durationDays;
    ends.set(task.id, endDay);
    placed.push({
      id: task.id,
      label: task.label,
      accent: STATUS_ACCENT[task.status],
      startDay,
      endDay,
    });
  }

  if (placed.length === 0)
    return ok({ nodes: [], edges: [], wedges: [], extent: rect(0, 0, 1, 1) });

  const minDay = placed.reduce((m, p) => Math.min(m, p.startDay), Number.POSITIVE_INFINITY);
  const nodes: SceneNode[] = placed.map((p, i) => {
    const x = (p.startDay - minDay) * DAY_WIDTH;
    const barWidth = Math.max((p.endDay - p.startDay) * DAY_WIDTH, measure(p.label) + LABEL_PAD);
    return {
      id: sceneNodeId(p.id),
      bounds: rect(x, i * ROW_HEIGHT, barWidth, BAR_HEIGHT),
      label: p.label,
      shape: "rect",
      parent: null,
      icon: null,
      rows: null,
      rowDivider: null,
      subtitle: null,
      accent: p.accent,
    };
  });

  const width = nodes.reduce((mx, n) => Math.max(mx, n.bounds.origin.x + n.bounds.size.width), 0);
  return ok({
    nodes,
    edges: [],
    wedges: [],
    extent: rect(0, 0, width, placed.length * ROW_HEIGHT),
  });
};
