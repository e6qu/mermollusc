import { ok, point, rect, twoOrMore, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
import type { Scene, SceneEdge, SceneNode, TimelineAst, TimelinePeriod } from "@m/contracts";
import type { LayoutError, MeasureText } from "./graph.js";
import { widestLine } from "./measure.js";

const PAD = 14;
const MIN_COL_W = 92;
const COL_GAP = 18;
const PERIOD_H = 36;
const EVENT_H = 32;
const LINE_H = 16; // extra height per `<br>` line beyond the first
const ROW_GAP = 12;
const SECTION_H = 26;
const SECTION_GAP = 10;
const MARGIN = 16;

// `<br>` becomes a newline in labels (the parser already converted it), so a cell's width is the
// widest line and its height grows per extra line.
const lineCount = (text: string): number => text.split("\n").length;
const boxHeight = (text: string, base: number): number => base + (lineCount(text) - 1) * LINE_H;

const colWidth = (period: TimelinePeriod, measure: MeasureText): number =>
  Math.max(
    MIN_COL_W,
    widestLine(period.label, measure) + 2 * PAD,
    ...period.events.map((e) => widestLine(e.text, measure) + 2 * PAD),
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
    const pH = boxHeight(period.label, PERIOD_H);
    nodes.push({
      id: sceneNodeId(period.id),
      bounds: rect(cursor, periodY, w, pH),
      label: period.label,
      shape: "round",
      parent: null,
      icon: null,
      rows: null,
      rowDivider: null,
      subtitle: null,
      accent: "none",
      role: "normal",
    });
    // Spine passes through the period row at a fixed height, so multi-line periods grow downward
    // without tilting the axis.
    centers.push({ x: cursor + w / 2, y: periodY + PERIOD_H / 2 });
    let ey = Math.max(eventsY0, periodY + pH + ROW_GAP);
    for (const event of period.events) {
      const eH = boxHeight(event.text, EVENT_H);
      nodes.push({
        id: sceneNodeId(event.id),
        bounds: rect(cursor, ey, w, eH),
        label: event.text,
        shape: "rect",
        parent: null,
        icon: null,
        rows: null,
        rowDivider: null,
        subtitle: null,
        accent: "none",
        role: "normal",
      });
      grow(cursor + w, ey + eH);
      ey += eH + ROW_GAP;
    }
    grow(cursor + w, periodY + pH);
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
        id: sceneNodeId(`section:${run}`),
        bounds: rect(left, sectionY, bandW, SECTION_H),
        label: name,
        shape: "container",
        parent: null,
        icon: null,
        rows: null,
        rowDivider: null,
        subtitle: null,
        accent: "none",
        role: "normal",
      });
      grow(left + bandW, sectionY + SECTION_H);
    }
    run = end + 1;
  }

  // The spine: a single markerless polyline through every period centre (drawn under the nodes).
  if (centers.length >= 2) {
    const first = ast.periods[0];
    const last = ast.periods[ast.periods.length - 1];
    const [a, b, ...rest] = centers.map((c) => point(c.x, c.y));
    if (first !== undefined && last !== undefined && a !== undefined && b !== undefined) {
      edges.push({
        id: sceneEdgeId("spine"),
        from: sceneNodeId(first.id),
        to: sceneNodeId(last.id),
        waypoints: twoOrMore(a, b, ...rest),
        label: null,
        stroke: "solid",
        fromEnd: "none",
        toEnd: "none",
        curved: false,
        fromLabel: null,
        toLabel: null,
        labelPos: null,
      });
    }
  }

  return ok({
    nodes,
    edges,
    wedges: [],
    decorations: [],
    extent: rect(0, 0, maxX + MARGIN, maxY + MARGIN),
  });
};
