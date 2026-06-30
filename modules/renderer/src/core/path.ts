import { point } from "@m/std";
import type { Point } from "@m/std";
import type { SceneEdge } from "@m/contracts";

export type PathCmd =
  | { readonly kind: "moveTo"; readonly x: number; readonly y: number }
  | { readonly kind: "lineTo"; readonly x: number; readonly y: number }
  | {
      readonly kind: "quadTo";
      readonly cx: number;
      readonly cy: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "cubicTo";
      readonly c1x: number;
      readonly c1y: number;
      readonly c2x: number;
      readonly c2y: number;
      readonly x: number;
      readonly y: number;
    };

export interface EdgeCrossing {
  readonly point: Point;
  readonly t: number;
  readonly segmentIndex: number;
}

const HOP_R = 4;
const CORNER_RADIUS = 9;
const LABEL_GAP = 11;

export const buildEdgePath = (
  pts: readonly Point[],
  curved: boolean,
  crossings: readonly EdgeCrossing[],
): readonly PathCmd[] => {
  const path: PathCmd[] = [];
  const first = pts[0];
  if (first === undefined) return path;

  if (curved && pts.length === 2) {
    const last = pts[1];
    if (last !== undefined) {
      const [c1, c2] = bezierControls(first, last);
      path.push({ kind: "moveTo", x: first.x, y: first.y });
      path.push({
        kind: "cubicTo",
        c1x: c1.x,
        c1y: c1.y,
        c2x: c2.x,
        c2y: c2.y,
        x: last.x,
        y: last.y,
      });
      return path;
    }
  }

  if (curved && pts.length > 2) {
    path.push({ kind: "moveTo", x: first.x, y: first.y });
    for (const op of roundedCorners(pts, CORNER_RADIUS)) {
      if (op.ctrl === null) {
        path.push({ kind: "lineTo", x: op.to.x, y: op.to.y });
      } else {
        path.push({ kind: "quadTo", cx: op.ctrl.x, cy: op.ctrl.y, x: op.to.x, y: op.to.y });
      }
    }
    return path;
  }

  path.push({ kind: "moveTo", x: first.x, y: first.y });
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (p1 === undefined || p2 === undefined) continue;

    const segCrossings = crossings
      .filter((c) => c.segmentIndex === i)
      .map((c) => ({ point: c.point, t: c.t, segmentIndex: c.segmentIndex }))
      .sort((a, b) => a.t - b.t);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);

    if (segCrossings.length === 0 || len < 1e-3) {
      path.push({ kind: "lineTo", x: p2.x, y: p2.y });
      continue;
    }

    const ux = dx / len;
    const uy = dy / len;
    const vx = -uy;
    const vy = ux;

    for (const c of segCrossings) {
      const distStart = c.t * len;
      const distEnd = (1 - c.t) * len;
      if (distStart < HOP_R + 2 || distEnd < HOP_R + 2) continue;

      const pStart = point(c.point.x - ux * HOP_R, c.point.y - uy * HOP_R);
      const pEnd = point(c.point.x + ux * HOP_R, c.point.y + uy * HOP_R);
      const ctrl = point(c.point.x + vx * HOP_R * 1.5, c.point.y + vy * HOP_R * 1.5);

      path.push({ kind: "lineTo", x: pStart.x, y: pStart.y });
      path.push({ kind: "quadTo", cx: ctrl.x, cy: ctrl.y, x: pEnd.x, y: pEnd.y });
    }
    path.push({ kind: "lineTo", x: p2.x, y: p2.y });
  }

  return path;
};

export const edgeCrossings = (
  edges: readonly SceneEdge[],
): ReadonlyMap<number, readonly EdgeCrossing[]> => {
  const crossingsMap = new Map<number, EdgeCrossing[]>();

  for (let i = 0; i < edges.length; i++) {
    const e1 = edges[i];
    if (e1 === undefined) continue;
    const pts1 = e1.waypoints;

    for (let j = i + 1; j < edges.length; j++) {
      const e2 = edges[j];
      if (e2 === undefined) continue;
      const pts2 = e2.waypoints;

      if (e1.from === e2.from || e1.from === e2.to || e1.to === e2.from || e1.to === e2.to) {
        continue;
      }

      for (let s1 = 0; s1 < pts1.length - 1; s1++) {
        const a = pts1[s1];
        const b = pts1[s1 + 1];
        if (a === undefined || b === undefined) continue;

        for (let s2 = 0; s2 < pts2.length - 1; s2++) {
          const c = pts2[s2];
          const d = pts2[s2 + 1];
          if (c === undefined || d === undefined) continue;

          const intersect = lineIntersection(a, b, c, d);
          if (intersect === null) continue;

          const aVertical = Math.abs(a.x - b.x) < Math.abs(a.y - b.y);
          const cVertical = Math.abs(c.x - d.x) < Math.abs(c.y - d.y);
          const hop = hopTarget(i, s1, j, s2, aVertical, cVertical);
          const pts = hop.edgeIndex === i ? pts1 : pts2;
          const start = pts[hop.segmentIndex];
          const end = pts[hop.segmentIndex + 1];
          if (start === undefined || end === undefined) continue;

          const len = Math.hypot(end.x - start.x, end.y - start.y);
          const dist = Math.hypot(intersect.x - start.x, intersect.y - start.y);
          const list = crossingsMap.get(hop.edgeIndex) ?? [];
          list.push({
            segmentIndex: hop.segmentIndex,
            t: len > 0 ? dist / len : 0,
            point: intersect,
          });
          crossingsMap.set(hop.edgeIndex, list);
        }
      }
    }
  }

  return crossingsMap;
};

export const pathPointAt = (
  points: readonly Point[],
  ratio: number,
): { readonly point: Point; readonly segmentStart: Point; readonly segmentEnd: Point } => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a !== undefined && b !== undefined) total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const clamped = Math.max(0, Math.min(1, ratio));
  let remaining = total * clamped;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen === 0) continue;
    if (remaining <= segLen) {
      const t = remaining / segLen;
      return {
        point: point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t),
        segmentStart: a,
        segmentEnd: b,
      };
    }
    remaining -= segLen;
  }
  const first = points[0] ?? point(0, 0);
  const last = points[points.length - 1] ?? first;
  return { point: first, segmentStart: first, segmentEnd: last };
};

export const edgeLabelAnchorAt = (
  points: readonly Point[],
  ratio: number,
): { readonly x: number; readonly y: number } => {
  const at = pathPointAt(points, ratio);
  const dx = at.segmentEnd.x - at.segmentStart.x;
  const dy = at.segmentEnd.y - at.segmentStart.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: at.point.x, y: at.point.y };
  return {
    x: at.point.x - (dy / len) * LABEL_GAP,
    y: at.point.y + (dx / len) * LABEL_GAP,
  };
};

export const pathRatioNearest = (points: readonly Point[], target: Point): number => {
  let total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = a === undefined || b === undefined ? 0 : Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(len);
    total += len;
  }
  if (total === 0) return 0.5;
  let bestDist = Number.POSITIVE_INFINITY;
  let bestAlong = total / 2;
  let along = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = lengths[i - 1] ?? 0;
    if (a === undefined || b === undefined || len === 0) continue;
    const raw = ((target.x - a.x) * (b.x - a.x) + (target.y - a.y) * (b.y - a.y)) / (len * len);
    const t = Math.max(0, Math.min(1, raw));
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const dist = Math.hypot(target.x - x, target.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      bestAlong = along + len * t;
    }
    along += len;
  }
  return Math.max(0, Math.min(1, bestAlong / total));
};

const hopTarget = (
  edgeA: number,
  segmentA: number,
  edgeB: number,
  segmentB: number,
  aVertical: boolean,
  bVertical: boolean,
): { readonly edgeIndex: number; readonly segmentIndex: number } => {
  if (aVertical && !bVertical) return { edgeIndex: edgeB, segmentIndex: segmentB };
  if (!aVertical && bVertical) return { edgeIndex: edgeA, segmentIndex: segmentA };
  return { edgeIndex: edgeB, segmentIndex: segmentB };
};

const lineIntersection = (a: Point, b: Point, c: Point, d: Point): Point | null => {
  const det = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(det) < 1e-5) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / det;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / det;
  if (t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99) {
    return point(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y));
  }
  return null;
};

export const bezierControls = (a: Point, b: Point): readonly [Point, Point] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return [point(a.x + dx * 0.5, a.y), point(b.x - dx * 0.5, b.y)];
  }
  return [point(a.x, a.y + dy * 0.5), point(b.x, b.y - dy * 0.5)];
};

export interface CornerOp {
  readonly ctrl: Point | null;
  readonly to: Point;
}

export const roundedCorners = (points: readonly Point[], radius: number): readonly CornerOp[] => {
  const ops: CornerOp[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev === undefined || cur === undefined) continue;
    const next = points[i + 1];
    if (next === undefined) {
      ops.push({ ctrl: null, to: cur });
      break;
    }
    const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, d1 / 2, d2 / 2);
    if (r < 0.5 || d1 === 0 || d2 === 0) {
      ops.push({ ctrl: null, to: cur });
      continue;
    }
    ops.push({
      ctrl: null,
      to: point(cur.x - ((cur.x - prev.x) / d1) * r, cur.y - ((cur.y - prev.y) / d1) * r),
    });
    ops.push({
      ctrl: cur,
      to: point(cur.x + ((next.x - cur.x) / d2) * r, cur.y + ((next.y - cur.y) / d2) * r),
    });
  }
  return ops;
};

export interface CurveSegment {
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

export const smoothSegments = (points: readonly Point[]): readonly CurveSegment[] => {
  const segs: CurveSegment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];
    if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) continue;
    segs.push({
      c1: point(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6),
      c2: point(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6),
      to: point(p2.x, p2.y),
    });
  }
  return segs;
};
