import { err, ok, point, rect, type Result } from "@m/std";
import { sceneNodeId } from "@m/contracts";
import type { Decoration, GanttAst, GanttStatus, NodeAccent, Scene, SceneNode } from "@m/contracts";
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
const TOP_AXIS = 22; // band above the bars for the date captions
const LEFT_GUTTER = 96; // band left of the bars for the section captions

// Parse an ISO `YYYY-MM-DD` date to a whole-day number (days since the epoch, UTC so it's
// timezone-stable). The Gantt subset assumes ISO dates; other `dateFormat`s aren't resolved yet.
const parseDay = (date: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (m === null) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
};

// The inverse: a whole-day number back to its ISO date (for the axis captions).
const dayToISO = (day: number): string => {
  const dt = new Date(day * 86_400_000);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

// Epoch day 0 (1970-01-01) is a Thursday; `getUTCDay` returns 0 = Sunday … 6 = Saturday.
const isWeekend = (day: number): boolean => {
  const dow = new Date(day * 86_400_000).getUTCDay();
  return dow === 0 || dow === 6;
};

// Pure timeline layout: each task is a horizontal bar on a day axis — x by its start day, width by its
// duration, one row per task in document order. `after` starts chain off the referenced task's end
// (resolved in order, so a task can only follow one declared before it). When the diagram `excludes`
// weekends/holidays, those days are non-working: a start landing on one shifts to the next working day,
// and a duration is spent only on working days (so the bar stretches across the skipped ones). Bars are
// widened to fit their label so the text stays readable. No edges — `after` is positional.
export const layoutGantt = (ast: GanttAst, measure: MeasureText): Result<Scene, LayoutError> => {
  const excludeDays = new Set<number>();
  for (const date of ast.excludeDates) {
    const day = parseDay(date);
    if (day === null) {
      return err({
        kind: "layout",
        message: `gantt: excluded date "${date}" is unparseable (expected YYYY-MM-DD)`,
      });
    }
    excludeDays.add(day);
  }
  const isExcluded = (day: number): boolean =>
    excludeDays.has(day) || (ast.excludesWeekends && isWeekend(day));
  // Advance to the first working day on or after `day` (identity when nothing is excluded).
  const nextWorking = (day: number): number => {
    let d = day;
    while (isExcluded(d)) d += 1;
    return d;
  };
  // The calendar day at which `duration` working days have elapsed from `start` (a working day),
  // stretching across any excluded days in between. With no exclusions this is exactly `start + duration`.
  const workingEnd = (start: number, duration: number): number => {
    let day = start;
    let worked = 0;
    while (duration - worked > 1e-9) {
      if (isExcluded(day)) {
        day += 1;
      } else {
        const step = Math.min(1, duration - worked);
        worked += step;
        day += step;
      }
    }
    return day;
  };

  const ends = new Map<string, number>();
  const placed: Array<{
    readonly id: string;
    readonly label: string;
    readonly section: string | null;
    readonly accent: NodeAccent;
    readonly milestone: boolean;
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
      // Start at the latest predecessor's end, so `after a b c` waits on all of them.
      const endOf = (ref: string): Result<number, LayoutError> => {
        const predEnd = ends.get(ref);
        return predEnd === undefined
          ? err({
              kind: "layout",
              message: `gantt: task "${task.label}" starts after unknown task "${ref}"`,
            })
          : ok(predEnd);
      };
      // `refs[0]` is the OneOrMore tuple's total first slot, so it seeds the max with no empty guard.
      let latest = endOf(task.start.refs[0]);
      for (const ref of task.start.refs.slice(1)) {
        if (!latest.ok) break;
        const next = endOf(ref);
        latest = next.ok ? ok(Math.max(latest.value, next.value)) : next;
      }
      if (!latest.ok) return latest;
      startDay = latest.value;
    }
    // Shift a start that lands on a non-working day forward; spend the duration on working days only.
    startDay = nextWorking(startDay);
    const endDay = workingEnd(startDay, task.durationDays);
    ends.set(task.id, endDay);
    placed.push({
      id: task.id,
      label: task.label,
      section: task.section,
      accent: STATUS_ACCENT[task.status],
      milestone: task.milestone,
      startDay,
      endDay,
    });
  }

  if (placed.length === 0)
    return ok({ nodes: [], edges: [], wedges: [], decorations: [], extent: rect(0, 0, 1, 1) });

  const minDay = placed.reduce((m, p) => Math.min(m, p.startDay), Number.POSITIVE_INFINITY);
  const maxDay = placed.reduce((m, p) => Math.max(m, p.endDay), Number.NEGATIVE_INFINITY);
  const rowY = (row: number): number => TOP_AXIS + row * ROW_HEIGHT;
  // Day 0 of the chart is `minDay`; a task starting on `day` sits at this x (past the section gutter).
  const dayX = (day: number): number => LEFT_GUTTER + (day - minDay) * DAY_WIDTH;

  const nodes: SceneNode[] = placed.map((p, i) => {
    // A task is a bar (start..end); a milestone is a diamond centred on its single date.
    const w = Math.max((p.endDay - p.startDay) * DAY_WIDTH, measure(p.label) + LABEL_PAD);
    const x = p.milestone ? dayX(p.startDay) - w / 2 : dayX(p.startDay);
    return {
      id: sceneNodeId(p.id),
      bounds: rect(x, rowY(i), w, BAR_HEIGHT),
      label: p.label,
      shape: p.milestone ? "diamond" : "rect",
      parent: null,
      icon: null,
      rows: null,
      rowDivider: null,
      subtitle: null,
      accent: p.accent,
    };
  });

  const width = nodes.reduce((mx, n) => Math.max(mx, n.bounds.origin.x + n.bounds.size.width), 0);
  const bottom = rowY(placed.length);
  const rowPad = (ROW_HEIGHT - BAR_HEIGHT) / 2;
  const decorations: Decoration[] = [];

  // Section background bands — a faint zebra stripe behind each contiguous run of same-section rows
  // (full width so the gutter caption sits on it). Bands come first, so the rest draws on top.
  let bandIndex = 0;
  let runStart = 0;
  const sectionAt = (row: number): string | null => placed[row]?.section ?? null;
  const closeSectionRun = (endRow: number): void => {
    if (sectionAt(runStart) !== null) {
      decorations.push({
        kind: "band",
        bounds: rect(0, rowY(runStart) - rowPad, width, (endRow - runStart + 1) * ROW_HEIGHT),
        fill: bandIndex % 2 === 0 ? "section" : "sectionAlt",
      });
      bandIndex += 1;
    }
  };
  for (let row = 1; row <= placed.length; row += 1) {
    if (row === placed.length || sectionAt(row) !== sectionAt(runStart)) {
      closeSectionRun(row - 1);
      runStart = row;
    }
  }

  // Excluded-day columns — a greyer band over each non-working calendar day in the visible span.
  for (let day = minDay; day < Math.ceil(maxDay); day += 1) {
    if (isExcluded(day)) {
      decorations.push({
        kind: "band",
        bounds: rect(dayX(day), TOP_AXIS, DAY_WIDTH, bottom - TOP_AXIS),
        fill: "excluded",
      });
    }
  }

  // A gridline + date caption every `tickIntervalDays` (weekly by default), the first on the chart start.
  for (let day = minDay; day <= maxDay; day += ast.tickIntervalDays) {
    const x = dayX(day);
    decorations.push({ kind: "rule", from: point(x, TOP_AXIS), to: point(x, bottom) });
    decorations.push({ kind: "caption", at: point(x, 8), text: dayToISO(day), align: "center" });
  }
  // A section caption in the left gutter at the row of each section's first task.
  let lastSection: string | null = null;
  placed.forEach((p, i) => {
    if (p.section !== null && p.section !== lastSection) {
      decorations.push({
        kind: "caption",
        at: point(8, rowY(i) + BAR_HEIGHT / 2),
        text: p.section,
        align: "left",
      });
    }
    lastSection = p.section;
  });

  return ok({ nodes, edges: [], wedges: [], decorations, extent: rect(0, 0, width, bottom) });
};
