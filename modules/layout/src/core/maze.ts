import { point, type Point } from "@m/std";

// A pure orthogonal (right-angle) connector router that bends around obstacles — the general case the
// local Z-route repair in `route.ts` can't cover (multi-bend detours past several boxes at once). It
// builds a Hanan grid (lines at every obstacle border ± a margin, plus the two endpoints) and runs A*
// over the grid intersections, allowing only axis-aligned moves whose segment clears every obstacle,
// with a turn penalty so the path prefers few bends. Returns the simplified point list (endpoints
// included), or null when no obstacle-free path exists (the caller then falls back).

export interface MazeBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

// A strict bounding-box overlap is exact for an axis-aligned segment vs an axis-aligned box: touching a
// border (the grid lines sit a margin outside each box) doesn't count as passing through.
const segThroughBox = (a: Point, b: Point, o: MazeBox): boolean => {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return x0 < o.x + o.w && x1 > o.x && y0 < o.y + o.h && y1 > o.y;
};
const clear = (a: Point, b: Point, obstacles: readonly MazeBox[]): boolean => {
  for (const o of obstacles) if (segThroughBox(a, b, o)) return false;
  return true;
};

const sortedUnique = (values: readonly number[]): number[] =>
  [...new Set(values)].sort((p, q) => p - q);

// A binary min-heap keyed by `f` — small and self-contained so the router stays a pure core module.
interface HeapItem {
  readonly state: number;
  readonly f: number;
}
const heapPush = (heap: HeapItem[], item: HeapItem): void => {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    const p = heap[parent];
    const c = heap[i];
    if (p === undefined || c === undefined || p.f <= c.f) break;
    heap[parent] = c;
    heap[i] = p;
    i = parent;
  }
};
const heapPop = (heap: HeapItem[]): HeapItem | null => {
  const top = heap[0];
  if (top === undefined) return null;
  const last = heap.pop();
  if (last !== undefined && heap.length > 0) {
    heap[0] = last;
    const n = heap.length;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let smallest = i;
      const hl = heap[l];
      const hr = heap[r];
      const hs1 = heap[smallest];
      if (l < n && hl !== undefined && hs1 !== undefined && hl.f < hs1.f) smallest = l;
      const hs2 = heap[smallest];
      if (r < n && hr !== undefined && hs2 !== undefined && hr.f < hs2.f) smallest = r;
      if (smallest === i) break;
      const a = heap[i];
      const b = heap[smallest];
      if (a === undefined || b === undefined) break;
      heap[i] = b;
      heap[smallest] = a;
      i = smallest;
    }
  }
  return top;
};

const TURN_PENALTY = 14; // a bend costs this much extra, so straighter routes win ties

export const mazeRoute = (
  start: Point,
  goal: Point,
  obstacles: readonly MazeBox[],
  margin: number,
): readonly Point[] | null => {
  const xs = sortedUnique([
    start.x,
    goal.x,
    ...obstacles.flatMap((o) => [o.x - margin, o.x + o.w + margin]),
  ]);
  const ys = sortedUnique([
    start.y,
    goal.y,
    ...obstacles.flatMap((o) => [o.y - margin, o.y + o.h + margin]),
  ]);
  const w = xs.length;
  const h = ys.length;
  const xiOf = new Map(xs.map((v, i) => [v, i]));
  const yiOf = new Map(ys.map((v, i) => [v, i]));
  const si = xiOf.get(start.x);
  const sj = yiOf.get(start.y);
  const gi = xiOf.get(goal.x);
  const gj = yiOf.get(goal.y);
  if (si === undefined || sj === undefined || gi === undefined || gj === undefined) return null;

  // State packs (gridX, gridY, incomingDir): dir 0 = none (start), 1 = horizontal, 2 = vertical.
  const pt = (i: number, j: number): Point => point(xs[i] ?? 0, ys[j] ?? 0);
  const stateId = (i: number, j: number, dir: number): number => (j * w + i) * 3 + dir;
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const heuristic = (i: number, j: number): number =>
    Math.abs((xs[i] ?? 0) - goal.x) + Math.abs((ys[j] ?? 0) - goal.y);

  const startState = stateId(si, sj, 0);
  gScore.set(startState, 0);
  const open: HeapItem[] = [];
  heapPush(open, { state: startState, f: heuristic(si, sj) });

  const unpack = (s: number): { i: number; j: number; dir: number } => {
    const dir = s % 3;
    const cell = (s - dir) / 3;
    return { i: cell % w, j: Math.floor(cell / w), dir };
  };

  for (;;) {
    const current = heapPop(open);
    if (current === null) return null;
    const { i, j, dir } = unpack(current.state);
    if (i === gi && j === gj) break;
    const g = gScore.get(current.state) ?? Number.POSITIVE_INFINITY;
    if (current.f - heuristic(i, j) > g) continue; // a stale heap entry superseded by a cheaper one
    const here = pt(i, j);
    const steps: ReadonlyArray<{ ni: number; nj: number; ndir: number }> = [
      { ni: i + 1, nj: j, ndir: 1 },
      { ni: i - 1, nj: j, ndir: 1 },
      { ni: i, nj: j + 1, ndir: 2 },
      { ni: i, nj: j - 1, ndir: 2 },
    ];
    for (const { ni, nj, ndir } of steps) {
      if (ni < 0 || ni >= w || nj < 0 || nj >= h) continue;
      const next = pt(ni, nj);
      if (!clear(here, next, obstacles)) continue;
      const stepLen = Math.abs(next.x - here.x) + Math.abs(next.y - here.y);
      const turn = dir !== 0 && dir !== ndir ? TURN_PENALTY : 0;
      const ns = stateId(ni, nj, ndir);
      const tentative = g + stepLen + turn;
      if (tentative < (gScore.get(ns) ?? Number.POSITIVE_INFINITY)) {
        gScore.set(ns, tentative);
        cameFrom.set(ns, current.state);
        heapPush(open, { state: ns, f: tentative + heuristic(ni, nj) });
      }
    }
  }

  // Reconstruct: find the cheapest goal state (any incoming dir), walk back, then drop collinear points.
  let bestGoal: number | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let dir = 0; dir < 3; dir++) {
    const s = stateId(gi, gj, dir);
    const c = gScore.get(s);
    if (c !== undefined && c < bestCost) {
      bestCost = c;
      bestGoal = s;
    }
  }
  if (bestGoal === null) return null;
  const path: Point[] = [];
  let cur: number | null = bestGoal;
  while (cur !== null) {
    const { i, j } = unpack(cur);
    path.push(pt(i, j));
    cur = cameFrom.get(cur) ?? null;
  }
  path.reverse();
  const simplified: Point[] = [];
  for (const p of path) {
    const n = simplified.length;
    const a = simplified[n - 2];
    const b = simplified[n - 1];
    if (a !== undefined && b !== undefined) {
      const collinear = (a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y);
      if (collinear) {
        simplified[n - 1] = p; // extend the straight run instead of adding a redundant vertex
        continue;
      }
    }
    simplified.push(p);
  }
  return simplified.length >= 2 ? simplified : null;
};
