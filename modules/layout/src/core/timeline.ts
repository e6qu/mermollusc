import { brand, ok, point, rect, type Result } from "@m/std";
import type { Scene, SceneEdge, SceneNode, TimelineAst, TimelinePeriod } from "@m/contracts";
import type { LayoutError, MeasureText } from "./graph.js";

const PAD = 14;
const MIN_COL_W = 92;
const COL_GAP = 18;
const PERIOD_H = 36;
const EVENT_H = 32;
const ROW_GAP = 12;
const SECTION_H = 26;
const SECTION_GAP = 10;
const MARGIN = 16;

const colWidth = (period: TimelinePeriod, measure: MeasureText): number =>
  Math.max(
    MIN_COL_W,
    measure(period.label) + 2 * PAD,
    ...period.events.map((e) => measure(e.text) + 2 * PAD),
  );

// Deterministic timeline layout — no ELK. Periods sit in a left→right row joined by a horizontal
// spine; each period's events stack in its column below it. `section` runs (contiguous periods that
// share a section) get a labelled band above the period row. Periods are rounded header nodes, events
// plain rects, the spine a markerless polyline — all already in the SceneGraph, so no renderer change.
export const layoutTimeline = (
  ast: TimelineAst,
  measure: MeasureText,
): Result<Scene, LayoutError> => {
  const hasSections = ast.periods.some((p) => p.section !== null);
  const sectionY = MARGIN;
  const periodY = hasSections ? MARGIN + SECTION_H + SECTION_GAP : MARGIN;
  const eventsY0 = periodY + PERIOD_H + ROW_GAP;

  const nodes: SceneNode[] = [];
  const edges: SceneEdge[] = [];
  const centers: { readonly x: number; readonly y: number }[] = [];
  const colX: number[] = [];
  const colW: number[] = [];
  let maxX = 0;
  let maxY = 0;
  const grow = (x: number, y: number): void => {
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  let cursor = MARGIN;
  for (const period of ast.periods) {
    const w = colWidth(period, measure);
    colX.push(cursor);
    colW.push(w);
    nodes.push({
      id: brand<string, "SceneNodeId">(period.id),
      bounds: rect(cursor, periodY, w, PERIOD_H),
      label: period.label,
      shape: "round",
      parent: null,
      icon: null,
      rows: null,
      rowDivider: null,
      subtitle: null,
    });
    centers.push({ x: cursor + w / 2, y: periodY + PERIOD_H / 2 });
    for (const [j, event] of period.events.entries()) {
      const y = eventsY0 + j * (EVENT_H + ROW_GAP);
      nodes.push({
        id: brand<string, "SceneNodeId">(event.id),
        bounds: rect(cursor, y, w, EVENT_H),
        label: event.text,
        shape: "rect",
        parent: null,
        icon: null,
        rows: null,
        rowDivider: null,
        subtitle: null,
      });
      grow(cursor + w, y + EVENT_H);
    }
    grow(cursor + w, periodY + PERIOD_H);
    cursor += w + COL_GAP;
  }

  // Section bands: one per maximal run of consecutive periods sharing a (non-null) section name.
  let run = 0;
  while (run < ast.periods.length) {
    const name = ast.periods[run]?.section ?? null;
    let end = run;
    while (end + 1 < ast.periods.length && (ast.periods[end + 1]?.section ?? null) === name) end++;
    if (name !== null) {
      const left = colX[run] ?? MARGIN;
      const rightX = colX[end] ?? left;
      const rightW = colW[end] ?? 0;
      const bandW = rightX + rightW - left;
      nodes.push({
        id: brand<string, "SceneNodeId">(`section:${run}`),
        bounds: rect(left, sectionY, bandW, SECTION_H),
        label: name,
        shape: "container",
        parent: null,
        icon: null,
        rows: null,
        rowDivider: null,
        subtitle: null,
      });
      grow(left + bandW, sectionY + SECTION_H);
    }
    run = end + 1;
  }

  // The spine: a single markerless polyline through every period centre (drawn under the nodes).
  if (centers.length >= 2) {
    const first = ast.periods[0];
    const last = ast.periods[ast.periods.length - 1];
    if (first !== undefined && last !== undefined) {
      edges.push({
        id: brand<string, "SceneEdgeId">("spine"),
        from: brand<string, "SceneNodeId">(first.id),
        to: brand<string, "SceneNodeId">(last.id),
        waypoints: centers.map((c) => point(c.x, c.y)),
        label: null,
        stroke: "solid",
        fromEnd: "none",
        toEnd: "none",
      });
    }
  }

  return ok({
    nodes,
    edges,
    wedges: [],
    extent: rect(0, 0, maxX + MARGIN, maxY + MARGIN),
  });
};
