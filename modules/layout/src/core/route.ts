import { point, rect, twoOrMore, type Point, type TwoOrMore } from "@m/std";
import type { Scene, SceneEdge, SceneNode, SceneNodeId } from "@m/contracts";
import type { MeasureText } from "./graph.js";
import { mazeRoute, segmentThroughBox, OBSTACLE_CLEARANCE } from "./maze.js";

// Build an edge's waypoints (always ≥ 2) from a routing engine's point list. ELK normally returns a
// full route (each section carries at least its start + end), but a degenerate/unrouted edge can yield
// fewer than two points; rather than silently skip drawing it (the old renderer guard) or blank the
// whole diagram, fall back to a straight line between the two endpoint centres — a defined geometry.
export const routeWaypoints = (
  raw: readonly { readonly x: number; readonly y: number }[],
  fromCenter: Point,
  toCenter: Point,
): TwoOrMore<Point> => {
  const pts = raw.map((p) => point(p.x, p.y));
  const [first, second, ...rest] = pts;
  return first !== undefined && second !== undefined
    ? twoOrMore(first, second, ...rest)
    : twoOrMore(fromCenter, toCenter);
};

// The centre of a positioned box (origin + half its extent) — the straight-line fallback's anchor.
export const boxCenter = (x: number, y: number, width: number, height: number): Point =>
  point(x + width / 2, y + height / 2);

export interface RouteBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

// A right-angle (orthogonal) route between two boxes: exit/enter the sides that face each other with a
// Z-bend through the mid-channel, so the connector reads like an architecture/block link and its
// arrowhead sits at the target border (vs a diagonal centre-to-centre line that clips intervening
// cells). Collinear boxes degenerate to a straight segment. Shared by the cloud + block layouts.
export const orthogonalRoute = (
  a: RouteBox,
  b: RouteBox,
): readonly [Point, Point, Point, Point] => {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  if (Math.abs(bcx - acx) >= Math.abs(bcy - acy)) {
    const ax = bcx >= acx ? a.x + a.w : a.x; // exit the side facing b
    const bx = bcx >= acx ? b.x : b.x + b.w;
    const midX = (ax + bx) / 2;
    return [point(ax, acy), point(midX, acy), point(midX, bcy), point(bx, bcy)];
  }
  const ay = bcy >= acy ? a.y + a.h : a.y;
  const by = bcy >= acy ? b.y : b.y + b.h;
  const midY = (ay + by) / 2;
  return [point(acx, ay), point(acx, midY), point(bcx, midY), point(bcx, by)];
};

// Port spreading: when several connectors touch the same side of a node they otherwise all exit/enter at
// that side's centre and stack into one thick line. This recomputes every box→box edge as a right-angle
// route whose endpoints are spread into distinct *lanes* along each shared side (ordered by the opposite
// endpoint so lanes don't cross needlessly). Deterministic — same scene in, same routes out. Edges with a
// non-box endpoint (or a self-loop) keep their existing waypoints.
const CHANNEL_GAP = 10; // horizontal/vertical separation between parallel edges' cross-channel legs
type Side = "T" | "B" | "L" | "R";
const facingSide = (from: RouteBox, to: RouteBox): Side => {
  const fcx = from.x + from.w / 2;
  const fcy = from.y + from.h / 2;
  const tcx = to.x + to.w / 2;
  const tcy = to.y + to.h / 2;
  return Math.abs(tcx - fcx) >= Math.abs(tcy - fcy)
    ? tcx >= fcx
      ? "R"
      : "L"
    : tcy >= fcy
      ? "B"
      : "T";
};
const portAt = (box: RouteBox, side: Side, rank: number, count: number): Point => {
  const f = (rank + 1) / (count + 1); // even fractions across the side, never at the corners
  if (side === "R") return point(box.x + box.w, box.y + box.h * f);
  if (side === "L") return point(box.x, box.y + box.h * f);
  if (side === "B") return point(box.x + box.w * f, box.y + box.h);
  return point(box.x + box.w * f, box.y);
};

interface PortStub {
  readonly key: string;
  readonly perp: number;
}
const boxOfNode = (scene: Scene): Map<string, RouteBox> =>
  new Map(
    scene.nodes.map((n) => [
      n.id,
      {
        x: n.bounds.origin.x,
        y: n.bounds.origin.y,
        w: n.bounds.size.width,
        h: n.bounds.size.height,
      },
    ]),
  );

const routeHits = (pts: readonly Point[], obstacles: readonly RouteBox[]): number => {
  let hits = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a === undefined || b === undefined) continue;
    for (const o of obstacles) if (segmentThroughBox(a, b, o)) hits++;
  }
  return hits;
};
const routeLength = (pts: readonly Point[]): number => {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a !== undefined && b !== undefined) len += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  }
  return len;
};
const OBSTACLE_SCAN_STEPS = 16; // candidate channel positions tried when a Z-route hits a node

// The point at the half-way arc length along a multi-segment route — where a mid-route label sits.
const pathMidpoint = (pts: readonly Point[]): Point => {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a !== undefined && b !== undefined) total += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  }
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a === undefined || b === undefined) continue;
    const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (acc + seg >= total / 2) {
      const t = seg === 0 ? 0 : (total / 2 - acc) / seg;
      return point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
    acc += seg;
  }
  return pts[0] ?? point(0, 0);
};

// If the default Z-route would cut through an unrelated node, search for an orthogonal detour: two route
// topologies (the cross-channel leg along the dominant axis, OR transposed so it runs perpendicular — a
// dog-leg that lifts an aligned obstacle off the straight line), each scanned across positions inside AND
// beyond the inter-box gap. Keep the route with the fewest hits, then the shortest. A route that already
// clears every box is returned unchanged, so clean diagrams don't move (no golden churn).
const avoidObstacles = (
  p0: Point,
  p3: Point,
  m1: Point,
  m2: Point,
  horizontal: boolean,
  obstacles: readonly RouteBox[],
): { readonly m1: Point; readonly m2: Point } => {
  let best = {
    m1,
    m2,
    hits: routeHits([p0, m1, m2, p3], obstacles),
    len: routeLength([p0, m1, m2, p3]),
  };
  if (best.hits === 0) return { m1, m2 };
  const consider = (cm1: Point, cm2: Point): void => {
    const hits = routeHits([p0, cm1, cm2, p3], obstacles);
    const len = routeLength([p0, cm1, cm2, p3]);
    if (hits < best.hits || (hits === best.hits && len < best.len)) {
      best = { m1: cm1, m2: cm2, hits, len };
    }
  };
  // Topology A — channel along the dominant axis (the default shape), slid across an extended range.
  const aLo = horizontal ? Math.min(p0.x, p3.x) : Math.min(p0.y, p3.y);
  const aSpan = Math.max((horizontal ? Math.abs(p3.x - p0.x) : Math.abs(p3.y - p0.y)) || 1, 1);
  for (let k = 0; k <= OBSTACLE_SCAN_STEPS; k++) {
    const c = aLo - aSpan + k * ((3 * aSpan) / OBSTACLE_SCAN_STEPS);
    consider(
      horizontal ? point(c, p0.y) : point(p0.x, c),
      horizontal ? point(c, p3.y) : point(p3.x, c),
    );
  }
  // Topology B — transposed channel: the dog-leg runs perpendicular at an offset `d`, so an obstacle on
  // the straight port-to-port line is cleared by going above/below (or left/right of) it.
  const bCenter = horizontal ? (p0.y + p3.y) / 2 : (p0.x + p3.x) / 2;
  const bSpan = Math.max(aSpan, 200); // reach far enough to clear tall/wide obstacles either side
  for (let k = 0; k <= OBSTACLE_SCAN_STEPS; k++) {
    const d = bCenter - bSpan + k * ((2 * bSpan) / OBSTACLE_SCAN_STEPS);
    consider(
      horizontal ? point(p0.x, d) : point(d, p0.y),
      horizontal ? point(p3.x, d) : point(d, p3.y),
    );
  }
  return { m1: best.m1, m2: best.m2 };
};

// Re-route any edge that cuts through a non-endpoint, non-container node using the maze router, keeping
// the edge's existing endpoints (unlike `spreadPorts`, which also re-assigns ports). For already-routed
// scenes — the ELK families under "Tidy" — so their edges bend around residual obstacles too. Edges that
// already clear every box are returned untouched, so this changes nothing when nothing crosses.
const routeBoxOf = (n: Scene["nodes"][number]): RouteBox => ({
  x: n.bounds.origin.x,
  y: n.bounds.origin.y,
  w: n.bounds.size.width,
  h: n.bounds.size.height,
});

// Per-edge obstacle boxes — what an edge should avoid. A leaf node is an obstacle unless it's an
// endpoint. A group CONTAINER is an obstacle UNLESS the edge enters it (an endpoint is that container or
// nested inside it), so edges keep out of groups they don't belong to but can still reach an element
// inside one. A tendency, not a guarantee: if no clear route exists, the routers fall back.
const obstaclesForEdges = (scene: Scene): Map<string, readonly RouteBox[]> => {
  const parentOf = new Map<string, string | null>(scene.nodes.map((n) => [n.id, n.parent]));
  const ancestorsOf = (id: string): ReadonlySet<string> => {
    const out = new Set<string>();
    let p = parentOf.get(id) ?? null;
    for (let guard = 0; p !== null && guard < 64; guard++) {
      out.add(p);
      p = parentOf.get(p) ?? null;
    }
    return out;
  };
  return new Map(
    scene.edges.map((e) => {
      const entered = new Set<string>([...ancestorsOf(e.from), ...ancestorsOf(e.to)]);
      const boxes = scene.nodes
        .filter((n) => {
          if (n.id === e.from || n.id === e.to) return false;
          if (n.shape === "container") return !entered.has(n.id);
          return true;
        })
        .map(routeBoxOf);
      return [e.id, boxes];
    }),
  );
};

// The four side-centre mount points of a box (right, left, bottom, top) — so a detour can leave/enter a
// node on whichever side gives the clearest route, instead of always the one the layout first picked.
const sideMounts = (b: RouteBox): readonly Point[] => [
  point(b.x + b.w, b.y + b.h / 2),
  point(b.x, b.y + b.h / 2),
  point(b.x + b.w / 2, b.y + b.h),
  point(b.x + b.w / 2, b.y),
];

// Route an obstacle-crossing edge with the maze router, trying every (from-side, to-side) mount-point
// pair and keeping the path with the fewest obstacle hits, then the shortest. Returns null when the
// edge already clears everything or no better orthogonal path is found.
const mazeAroundObstacles = (
  fromBox: RouteBox | null,
  toBox: RouteBox | null,
  start: Point,
  end: Point,
  current: readonly Point[],
  obstacles: readonly RouteBox[],
): readonly Point[] | null => {
  if (routeHits(current, obstacles) === 0) return null;
  const starts = fromBox === null ? [start] : sideMounts(fromBox);
  const ends = toBox === null ? [end] : sideMounts(toBox);
  let best: { path: readonly Point[]; hits: number; len: number } | null = null;
  for (const s of starts) {
    for (const t of ends) {
      const maze = mazeRoute(s, t, obstacles, OBSTACLE_CLEARANCE);
      if (maze === null || maze.length < 2) continue;
      const hits = routeHits(maze, obstacles);
      const len = routeLength(maze);
      if (best === null || hits < best.hits || (hits === best.hits && len < best.len)) {
        best = { path: maze, hits, len };
      }
    }
  }
  return best === null ? null : best.path;
};

export const mazeRerouteEdges = (scene: Scene): Scene => {
  const obstacleBoxes = obstaclesForEdges(scene);
  const boxById = new Map<string, RouteBox>(scene.nodes.map((n) => [n.id, routeBoxOf(n)]));
  const edges = scene.edges.map((e): SceneEdge => {
    const start = e.waypoints[0];
    const end = e.waypoints[e.waypoints.length - 1];
    if (start === undefined || end === undefined || e.from === e.to) return e;
    const obstacles = obstacleBoxes.get(e.id) ?? [];
    const path = mazeAroundObstacles(
      boxById.get(e.from) ?? null,
      boxById.get(e.to) ?? null,
      start,
      end,
      e.waypoints,
      obstacles,
    );
    if (path !== null) {
      const [w0, w1, ...wr] = path;
      if (w0 !== undefined && w1 !== undefined) {
        return {
          ...e,
          waypoints: twoOrMore(w0, w1, ...wr),
          labelPos: e.labelPos === null ? null : pathMidpoint(path),
        };
      }
    }
    return e;
  });
  return { ...scene, edges };
};

// De-collide mid-edge labels on dense diagrams: where two edge labels (each placed at its `labelPos`)
// would overlap, move the later one to the NEAREST clear spot — searching outward in all four
// directions, so it follows the edge (smallest displacement) rather than dropping straight down. Greedy
// and order-stable; a label that fits is left exactly where the router put it (a no-op when nothing
// overlaps). Only edges with a label AND an explicit `labelPos` participate (a null one is anchored later
// by the renderer). `measure` is the pure text metric the layout already uses.
const LABEL_HEIGHT = 16;
const LABEL_X_PAD = 8; // horizontal padding folded into a label's measured width
const LABEL_GAP = 4; // minimum clear gap kept between two labels
const DECOLLIDE_STEP = 6;
const DECOLLIDE_MAX = 140; // give up past this displacement and leave the label put
const DECOLLIDE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];
export const decollideEdgeLabels = (scene: Scene, measure: MeasureText): Scene => {
  interface LabelBox {
    readonly cx: number;
    readonly cy: number;
    readonly halfW: number;
  }
  const placed: LabelBox[] = [];
  const overlaps = (cx: number, cy: number, halfW: number, b: LabelBox): boolean =>
    Math.abs(cx - b.cx) < halfW + b.halfW + LABEL_GAP &&
    Math.abs(cy - b.cy) < LABEL_HEIGHT + LABEL_GAP;
  const fits = (cx: number, cy: number, halfW: number): boolean =>
    placed.every((p) => !overlaps(cx, cy, halfW, p));
  const edges = scene.edges.map((e): SceneEdge => {
    const anchor = e.labelPos;
    if (e.label === null || anchor === null) return e;
    const halfW = (measure(e.label) + LABEL_X_PAD) / 2;
    const ax: number = anchor.x;
    const ay: number = anchor.y;
    let spot: { readonly cx: number; readonly cy: number } | null = null;
    if (!fits(ax, ay, halfW)) {
      for (let r = DECOLLIDE_STEP; r <= DECOLLIDE_MAX && spot === null; r += DECOLLIDE_STEP) {
        for (const [dx, dy] of DECOLLIDE_DIRS) {
          if (fits(ax + dx * r, ay + dy * r, halfW)) {
            spot = { cx: ax + dx * r, cy: ay + dy * r };
            break;
          }
        }
      }
    }
    const cx = spot?.cx ?? ax;
    const cy = spot?.cy ?? ay;
    placed.push({ cx, cy, halfW });
    return spot === null ? e : { ...e, labelPos: point(cx, cy) };
  });
  return { ...scene, edges };
};

// Proper crossing of two axis-aligned segments (one horizontal, one vertical, meeting in both
// interiors). Orthogonal routes only — what spreadPorts produces — so this is exact and cheap.
const orthSegmentsCross = (a1: Point, a2: Point, b1: Point, b2: Point): boolean => {
  const aHoriz = a1.y === a2.y;
  if (aHoriz === (b1.y === b2.y)) return false; // both horizontal or both vertical → never a proper cross
  const h1 = aHoriz ? a1 : b1;
  const h2 = aHoriz ? a2 : b2;
  const v1 = aHoriz ? b1 : a1;
  const v2 = aHoriz ? b2 : a2;
  return (
    v1.x > Math.min(h1.x, h2.x) &&
    v1.x < Math.max(h1.x, h2.x) &&
    h1.y > Math.min(v1.y, v2.y) &&
    h1.y < Math.max(v1.y, v2.y)
  );
};
// Do two PARALLEL axis-aligned segments run collinear on top of each other (sharing more than a touch of
// their interval on the same track)? This is the "overlap" that reads as a single thick stacked line — a
// distinct fault from a perpendicular crossing, and the dominant one on dense architecture diagrams.
const OVERLAP_EPS = 1; // tolerance for "same track"
const OVERLAP_MIN = 2; // shared length beyond which it reads as stacked
const orthSegmentsOverlap = (a1: Point, a2: Point, b1: Point, b2: Point): boolean => {
  const aHoriz = a1.y === a2.y;
  if (aHoriz !== (b1.y === b2.y)) return false; // not the same orientation → can't be collinear
  if (aHoriz) {
    if (Math.abs(a1.y - b1.y) > OVERLAP_EPS) return false;
    const lo = Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x));
    const hi = Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x));
    return hi - lo > OVERLAP_MIN;
  }
  if (Math.abs(a1.x - b1.x) > OVERLAP_EPS) return false;
  const lo = Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
  const hi = Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y));
  return hi - lo > OVERLAP_MIN;
};
const segmentsOf = (wp: readonly Point[]): ReadonlyArray<readonly [Point, Point]> => {
  const out: [Point, Point][] = [];
  for (let i = 1; i < wp.length; i++) {
    const a = wp[i - 1];
    const b = wp[i];
    if (a !== undefined && b !== undefined) out.push([a, b]);
  }
  return out;
};
// A "conflict" between two edge segments is a perpendicular CROSSING or a parallel OVERLAP; the optimiser
// below minimises both (re-routing), and `separateOverlaps` then de-stacks any remaining parallel runs
// onto separate lanes without re-routing.
const conflictsBetween = (
  path: readonly Point[],
  others: ReadonlyArray<readonly [Point, Point]>,
): number => {
  let n = 0;
  for (const [a, b] of segmentsOf(path)) {
    for (const [c, d] of others)
      if (orthSegmentsCross(a, b, c, d) || orthSegmentsOverlap(a, b, c, d)) n++;
  }
  return n;
};
const MAX_CROSS_SWEEPS = 3;
const MAX_CROSS_KICKS = 6; // iterated-local-search restarts when the greedy stalls with crossings left

const totalConflicts = (edges: readonly SceneEdge[]): number => {
  const segs = edges.map((e) => segmentsOf(e.waypoints));
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const si = segs[i];
      const sj = segs[j];
      if (si === undefined || sj === undefined) continue;
      for (const [a, b] of si)
        for (const [c, d] of sj)
          if (orthSegmentsCross(a, b, c, d) || orthSegmentsOverlap(a, b, c, d)) n++;
    }
  }
  return n;
};
const sameRoute = (a: readonly Point[], b: readonly Point[]): boolean =>
  a.length === b.length && a.every((p, i) => p.x === b[i]?.x && p.y === b[i]?.y);
const applyRoute = (e: SceneEdge, wp: readonly Point[]): SceneEdge => {
  const [w0, w1, ...wr] = wp;
  if (w0 === undefined || w1 === undefined) return e;
  return {
    ...e,
    waypoints: twoOrMore(w0, w1, ...wr),
    labelPos: e.labelPos === null ? null : pathMidpoint(wp),
  };
};

interface RouteCand {
  readonly wp: readonly Point[];
  readonly hits: number;
  readonly cross: number;
  readonly len: number;
}
const segBox = (c: Point, d: Point): RouteBox =>
  c.y === d.y
    ? { x: Math.min(c.x, d.x), y: c.y - 1, w: Math.abs(d.x - c.x), h: 2 }
    : { x: c.x - 1, y: Math.min(c.y, d.y), w: 2, h: Math.abs(d.y - c.y) };

// Every in-bounds 4×4 mount-point maze route for edge `i` — avoiding nodes/groups AND a thin obstacle
// along every segment of each edge it currently crosses (so the router steers fully around a conflicting
// edge instead of re-crossing) — each scored by node hits, edge-crossings, length. Sorted best-first.
// A memoised maze query, keyed by (start, goal, margin, obstacle boxes) — the same query recurs many
// times across the optimiser's sweeps and ILS kicks, and the A* over a big Hanan grid is the hot path.
type MazeFn = (
  s: Point,
  g: Point,
  obstacles: readonly RouteBox[],
  margin: number,
) => readonly Point[] | null;
const cachedMaze = (cache: Map<string, readonly Point[] | null>): MazeFn => {
  return (s, g, obstacles, margin) => {
    const key = `${s.x},${s.y};${g.x},${g.y};${margin};${obstacles
      .map((b) => `${b.x},${b.y},${b.w},${b.h}`)
      .sort()
      .join("|")}`;
    const hit = cache.get(key);
    if (hit !== undefined || cache.has(key)) return hit ?? null;
    const r = mazeRoute(s, g, obstacles, margin);
    cache.set(key, r);
    return r;
  };
};

const routeCandidates = (
  i: number,
  edges: readonly SceneEdge[],
  obstacleBoxes: Map<string, readonly RouteBox[]>,
  boxById: Map<string, RouteBox>,
  maze: MazeFn,
): RouteCand[] => {
  const e = edges[i];
  if (e === undefined || e.from === e.to) return [];
  const fromBox = boxById.get(e.from);
  const toBox = boxById.get(e.to);
  if (fromBox === undefined || toBox === undefined) return [];
  const others = edges.flatMap((o, j) => (j === i ? [] : segmentsOf(o.waypoints)));
  const nodeObstacles = obstacleBoxes.get(e.id) ?? [];
  const crossedBoxes: RouteBox[] = [];
  for (let j = 0; j < edges.length; j++) {
    const oj = edges[j];
    if (j === i || oj === undefined) continue;
    const ojSegs = segmentsOf(oj.waypoints);
    if (conflictsBetween(e.waypoints, ojSegs) === 0) continue;
    for (const [c, d] of ojSegs) crossedBoxes.push(segBox(c, d));
  }
  // Cull obstacles to those near this edge: a box well outside the endpoints' bounding region can't be on
  // any reasonable detour, and dropping it shrinks the maze's Hanan grid (the optimiser's hot path) a lot
  // on big diagrams. The window is the endpoints' bbox grown by its own larger dimension — wide enough for
  // any local detour.
  const lo = { x: Math.min(fromBox.x, toBox.x), y: Math.min(fromBox.y, toBox.y) };
  const hi = {
    x: Math.max(fromBox.x + fromBox.w, toBox.x + toBox.w),
    y: Math.max(fromBox.y + fromBox.h, toBox.y + toBox.h),
  };
  const pad = Math.max(hi.x - lo.x, hi.y - lo.y);
  const near = (b: RouteBox): boolean =>
    b.x < hi.x + pad && b.x + b.w > lo.x - pad && b.y < hi.y + pad && b.y + b.h > lo.y - pad;
  const mazeObstacles = [...nodeObstacles, ...crossedBoxes].filter(near);
  const curHits = routeHits(e.waypoints, nodeObstacles);
  const out: RouteCand[] = [];
  for (const s of sideMounts(fromBox)) {
    for (const t of sideMounts(toBox)) {
      const route = maze(s, t, mazeObstacles, OBSTACLE_CLEARANCE);
      if (route === null || route.length < 2) continue;
      const hits = routeHits(route, nodeObstacles); // node/group hits only, not the thin edge boxes
      if (hits > curHits) continue; // never trade a node/group crossing for an edge crossing
      out.push({
        wp: route,
        hits,
        cross: conflictsBetween(route, others),
        len: routeLength(route),
      });
    }
  }
  out.sort((a, b) => a.hits - b.hits || a.cross - b.cross || a.len - b.len);
  return out;
};

// Greedy local search: sweep edges, re-route each crossing one to its best alternate when that strictly
// reduces its crossings (or node hits). Bounded sweeps; only strict improvements → terminates.
const greedyReduce = (
  start: readonly SceneEdge[],
  obstacleBoxes: Map<string, readonly RouteBox[]>,
  boxById: Map<string, RouteBox>,
  maze: MazeFn,
): SceneEdge[] => {
  const edges = [...start];
  for (let sweep = 0; sweep < MAX_CROSS_SWEEPS; sweep++) {
    let improved = false;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (e === undefined) continue;
      const others = edges.flatMap((o, j) => (j === i ? [] : segmentsOf(o.waypoints)));
      const curCross = conflictsBetween(e.waypoints, others);
      if (curCross === 0) continue;
      const curHits = routeHits(e.waypoints, obstacleBoxes.get(e.id) ?? []);
      const top = routeCandidates(i, edges, obstacleBoxes, boxById, maze)[0];
      if (top !== undefined && (top.cross < curCross || top.hits < curHits)) {
        edges[i] = applyRoute(e, top.wp);
        improved = true;
      }
    }
    if (!improved) break;
  }
  return edges;
};

// Deterministically PERTURB a stalled configuration: force the `kick`-th crossing edge (most-crossing
// first) onto its best alternate route that differs from its current one — even though it doesn't improve
// that edge alone — so the next greedy pass can find improvements elsewhere. Null when nothing to kick.
const perturb = (
  edges: readonly SceneEdge[],
  kick: number,
  obstacleBoxes: Map<string, readonly RouteBox[]>,
  boxById: Map<string, RouteBox>,
  maze: MazeFn,
): SceneEdge[] | null => {
  const crossing: { readonly i: number; readonly n: number }[] = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (e === undefined) continue;
    const others = edges.flatMap((o, j) => (j === i ? [] : segmentsOf(o.waypoints)));
    const n = conflictsBetween(e.waypoints, others);
    if (n > 0) crossing.push({ i, n });
  }
  if (crossing.length === 0) return null;
  crossing.sort((a, b) => b.n - a.n || a.i - b.i); // most-crossing first, ties by index → deterministic
  const target = crossing[kick % crossing.length];
  if (target === undefined) return null;
  const e = edges[target.i];
  if (e === undefined) return null;
  const alt = routeCandidates(target.i, edges, obstacleBoxes, boxById, maze).find(
    (c) => !sameRoute(c.wp, e.waypoints),
  );
  if (alt === undefined) return null;
  const next = [...edges];
  next[target.i] = applyRoute(e, alt.wp);
  return next;
};

// Global edge–edge crossing minimisation. Greedy local search (re-route crossing edges around each other
// via the maze), then ITERATED LOCAL SEARCH — when the greedy stalls with crossings left, kick it out of
// the local minimum (force one edge onto a different route) and re-descend, keeping the best total seen.
// Deterministic, bounded, keeps the best → terminates and never makes the picture worse. A crossing-free
// scene short-circuits to byte-identical output.
export const minimizeCrossings = (scene: Scene): Scene => {
  const initial = totalConflicts(scene.edges);
  if (initial === 0) return scene;
  const obstacleBoxes = obstaclesForEdges(scene);
  const boxById = new Map<string, RouteBox>(scene.nodes.map((n) => [n.id, routeBoxOf(n)]));
  const maze = cachedMaze(new Map()); // memo shared across every sweep + kick of this run
  let bestEdges = greedyReduce(scene.edges, obstacleBoxes, boxById, maze);
  let bestN = totalConflicts(bestEdges);
  // Scale the (costlier) iterated-local-search down on pathologically dense graphs — the greedy already
  // ran; many full-span crossings would otherwise multiply the work without much payoff.
  const kicks = initial > 40 ? 1 : MAX_CROSS_KICKS;
  for (let kick = 0; kick < kicks && bestN > 0; kick++) {
    const perturbed = perturb(bestEdges, kick, obstacleBoxes, boxById, maze);
    if (perturbed === null) break;
    const reduced = greedyReduce(perturbed, obstacleBoxes, boxById, maze);
    const n = totalConflicts(reduced);
    if (n < bestN) {
      bestEdges = reduced;
      bestN = n;
    }
  }
  return { ...scene, edges: bestEdges };
};

const LANE_GAP = 8; // perpendicular separation between de-stacked parallel edge segments
const OVERLAP_SWEEPS = 4; // bounded passes; each separates the stacks the previous pass exposed
const SEG_AXIS_EPS = 0.5; // a segment counts as axis-aligned when its extent on one axis is below this

// One axis-aligned interior segment of a route, indexed so a perpendicular nudge can be applied back.
interface OverlapSeg {
  readonly edge: number; // index into the scene's edge list
  readonly start: number; // index of the segment's first waypoint within that edge
  readonly vertical: boolean;
  readonly track: number; // x for a vertical run, y for a horizontal one — the line it sits on
  readonly lo: number; // span along the run …
  readonly hi: number; // … from lo to hi
}

const anyOverlap = (edges: readonly SceneEdge[]): boolean => {
  const segs = edges.map((e) => segmentsOf(e.waypoints));
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const si = segs[i];
      const sj = segs[j];
      if (si === undefined || sj === undefined) continue;
      for (const [a, b] of si)
        for (const [c, d] of sj) if (orthSegmentsOverlap(a, b, c, d)) return true;
    }
  }
  return false;
};

// Within one track, give each maximal run of mutually-overlapping segments a distinct lane (greedy
// interval colouring), then a centred perpendicular offset per lane. Records offsets keyed by the segment
// object itself — no stringly composite key. Singleton runs get no offset (they aren't stacked).
const assignLaneOffsets = (group: readonly OverlapSeg[], into: Map<OverlapSeg, number>): void => {
  const sorted = [...group].sort((a, b) => a.lo - b.lo || a.edge - b.edge);
  let i = 0;
  while (i < sorted.length) {
    const head = sorted[i];
    if (head === undefined) {
      i++;
      continue;
    }
    const run: OverlapSeg[] = [head];
    let maxHi = head.hi;
    let j = i;
    while (j + 1 < sorted.length) {
      const next = sorted[j + 1];
      if (next === undefined || next.lo >= maxHi - OVERLAP_MIN) break;
      run.push(next);
      maxHi = Math.max(maxHi, next.hi);
      j++;
    }
    if (run.length >= 2) {
      const laneEnd: number[] = []; // laneEnd[L] = hi of the segment currently occupying lane L
      const laneOf = new Map<OverlapSeg, number>();
      for (const sg of run) {
        let lane = -1;
        for (const [L, end] of laneEnd.entries())
          if (end <= sg.lo) {
            lane = L;
            break;
          }
        if (lane === -1) {
          lane = laneEnd.length;
          laneEnd.push(sg.hi);
        } else laneEnd[lane] = sg.hi;
        laneOf.set(sg, lane);
      }
      const lanes = laneEnd.length;
      for (const sg of run) {
        const lane = laneOf.get(sg);
        if (lane === undefined) continue;
        into.set(sg, (lane - (lanes - 1) / 2) * LANE_GAP);
      }
    }
    i = j + 1;
  }
};

// Separate edge segments that run collinear on top of each other ("overlap") by nudging them onto
// adjacent parallel tracks — a topology-preserving LANE ASSIGNMENT, not a re-route. Only INTERIOR segments
// move (both endpoints are bends, never a node port); because orthogonal routes alternate horizontal and
// vertical, shifting a vertical leg in x (or a horizontal leg in y) only lengthens its perpendicular
// neighbours, so every route stays axis-aligned and connected. A nudge is kept only when it adds neither a
// node hit nor a new crossing — so it de-stacks what it can cleanly and leaves the rest to crossing-min.
export const separateOverlaps = (scene: Scene): Scene => {
  if (!anyOverlap(scene.edges)) return scene; // nothing stacked → byte-identical (no golden churn)
  const obstacleBoxes = obstaclesForEdges(scene);
  const routes: Point[][] = scene.edges.map((e) => e.waypoints.map((p) => point(p.x, p.y)));

  const collect = (): OverlapSeg[] => {
    const out: OverlapSeg[] = [];
    for (const [edge, w] of routes.entries()) {
      for (let start = 1; start + 2 < w.length; start++) {
        const a = w[start];
        const b = w[start + 1];
        if (a === undefined || b === undefined) continue;
        if (Math.abs(a.x - b.x) < SEG_AXIS_EPS)
          out.push({
            edge,
            start,
            vertical: true,
            track: a.x,
            lo: Math.min(a.y, b.y),
            hi: Math.max(a.y, b.y),
          });
        else if (Math.abs(a.y - b.y) < SEG_AXIS_EPS)
          out.push({
            edge,
            start,
            vertical: false,
            track: a.y,
            lo: Math.min(a.x, b.x),
            hi: Math.max(a.x, b.x),
          });
      }
    }
    return out;
  };

  for (let sweep = 0; sweep < OVERLAP_SWEEPS; sweep++) {
    const segs = collect();
    const verticalTracks = new Map<number, OverlapSeg[]>(); // keyed by the run's x …
    const horizontalTracks = new Map<number, OverlapSeg[]>(); // … or y, quantised to a track
    for (const sg of segs) {
      const tracks = sg.vertical ? verticalTracks : horizontalTracks;
      const key = Math.round(sg.track);
      const g = tracks.get(key);
      if (g === undefined) tracks.set(key, [sg]);
      else g.push(sg);
    }
    const offset = new Map<OverlapSeg, number>();
    for (const group of [...verticalTracks.values(), ...horizontalTracks.values()])
      if (group.length >= 2) assignLaneOffsets(group, offset);
    if (offset.size === 0) break; // converged — nothing left stacked

    // Per edge, the (dx,dy) for each waypoint that moves; a missing entry means "this waypoint stays put".
    // A vertical interior segment shifts its two endpoints in x, a horizontal one in y; since the segments
    // sharing a waypoint are perpendicular, each waypoint takes at most one x- and one y-shift — no clash.
    const shiftsByEdge: Map<number, { dx: number; dy: number }>[] = routes.map(() => new Map());
    for (const sg of segs) {
      const off = offset.get(sg);
      if (off === undefined) continue;
      const shifts = shiftsByEdge[sg.edge];
      if (shifts === undefined) continue;
      for (const idx of [sg.start, sg.start + 1]) {
        const prior = shifts.get(idx);
        const dx = sg.vertical ? off : prior === undefined ? 0 : prior.dx;
        const dy = sg.vertical ? (prior === undefined ? 0 : prior.dy) : off;
        shifts.set(idx, { dx, dy });
      }
    }
    for (const [edge, current] of routes.entries()) {
      const shifts = shiftsByEdge[edge];
      const sceneEdge = scene.edges[edge];
      const obstacles = sceneEdge === undefined ? undefined : obstacleBoxes.get(sceneEdge.id);
      if (shifts === undefined || shifts.size === 0 || obstacles === undefined) continue;
      const candidate = current.map((p, idx) => {
        const s = shifts.get(idx);
        return s === undefined ? p : point(p.x + s.dx, p.y + s.dy);
      });
      const others: (readonly [Point, Point])[] = [];
      for (const [other, w] of routes.entries())
        if (other !== edge) for (const seg of segmentsOf(w)) others.push(seg);
      // Keep the nudge unless it WORSENS things — more total conflicts or a new node hit. Net-neutral moves
      // are allowed: a lane shift that doesn't yet cut conflicts can reposition a stack so a later sweep
      // resolves it (the sweep count bounds this), which de-stacks more than a strict "must improve now" gate.
      const addsNodeHit = routeHits(candidate, obstacles) > routeHits(current, obstacles);
      const worsensConflicts =
        conflictsBetween(candidate, others) > conflictsBetween(current, others);
      if (!addsNodeHit && !worsensConflicts) routes[edge] = candidate;
    }
  }

  const edges = scene.edges.map((edge, e): SceneEdge => {
    const pts = routes[e];
    if (pts === undefined) return edge;
    const unchanged =
      edge.waypoints.length === pts.length &&
      edge.waypoints.every((p, idx) => {
        const q = pts[idx];
        return q !== undefined && p.x === q.x && p.y === q.y;
      });
    if (unchanged) return edge;
    const [w0, w1, ...wr] = pts;
    if (w0 === undefined || w1 === undefined) return edge;
    return {
      ...edge,
      waypoints: twoOrMore(w0, w1, ...wr),
      labelPos: edge.labelPos === null ? null : pathMidpoint(pts),
    };
  });
  return { ...scene, edges };
};

const CHANNEL_BASE = 24; // minimum gap kept between two node bands, before lane reservation
const CHANNEL_MARGIN = 16; // extent padding after expansion
// Width reserved per edge crossing a channel — a bit over one lane (`LANE_GAP`), since a Z-route's two
// stubs each want a slot. Tuned so dense architecture channels get enough room for the lane pass to
// de-stack without crossings, while sparse channels (few/no crossing edges) stay compact.
const CHANNEL_LANE = 13;
const MAX_NEST_DEPTH = 64; // group nesting can't realistically exceed this; bounds the ancestor walk

// One contiguous strip of top-level nodes along an axis; the groups in it shift together (rigidly).
interface NodeBand {
  lo: number;
  hi: number;
  readonly ids: Set<SceneNodeId>;
}

// Reserve channel width by edge density (the root fix for stacked edges): the gap between two bands of
// top-level nodes/groups must fit a LANE for every edge that crosses it, so the lane-separation pass has
// room to de-stack without crossings. Bands (and the groups in them) shift rigidly to open the room, so
// containment is preserved. A no-op when the existing gaps already suffice (sparse diagrams don't move).
const reserveChannels = (scene: Scene): Scene => {
  const parentOf = new Map<SceneNodeId, SceneNodeId | null>(
    scene.nodes.map((n) => [n.id, n.parent]),
  );
  const topAncestor = (id: SceneNodeId): SceneNodeId => {
    let cur = id;
    for (let depth = 0; depth < MAX_NEST_DEPTH; depth++) {
      const p = parentOf.get(cur);
      if (p === undefined || p === null) break; // reached a top-level node (or an unknown id)
      cur = p;
    }
    return cur;
  };
  const shiftsForAxis = (vertical: boolean): Map<SceneNodeId, number> => {
    const top = scene.nodes.filter((n) => n.parent === null);
    if (top.length < 2) return new Map();
    const lo = (n: SceneNode): number => (vertical ? n.bounds.origin.y : n.bounds.origin.x);
    const ext = (n: SceneNode): number => (vertical ? n.bounds.size.height : n.bounds.size.width);
    const ivs = top
      .map((n) => ({ id: n.id, lo: lo(n), hi: lo(n) + ext(n) }))
      .sort((a, b) => a.lo - b.lo);
    const bands: NodeBand[] = [];
    for (const iv of ivs) {
      const last = bands[bands.length - 1];
      if (last !== undefined && iv.lo <= last.hi) {
        last.hi = Math.max(last.hi, iv.hi);
        last.ids.add(iv.id);
      } else bands.push({ lo: iv.lo, hi: iv.hi, ids: new Set([iv.id]) });
    }
    if (bands.length < 2) return new Map();
    const bandOf = new Map<SceneNodeId, number>();
    for (const [bi, b] of bands.entries()) for (const id of b.ids) bandOf.set(id, bi);
    const crossing = new Array<number>(bands.length - 1).fill(0); // edges crossing each inter-band gap
    for (const e of scene.edges) {
      if (e.from === e.to) continue;
      const a = bandOf.get(topAncestor(e.from));
      const b = bandOf.get(topAncestor(e.to));
      if (a === undefined || b === undefined || a === b) continue;
      for (let g = Math.min(a, b); g < Math.max(a, b); g++) {
        const c = crossing[g];
        if (c === undefined) continue;
        crossing[g] = c + 1;
      }
    }
    const shiftForBand = new Array<number>(bands.length).fill(0);
    let cumulative = 0;
    for (let g = 0; g + 1 < bands.length; g++) {
      const above = bands[g];
      const below = bands[g + 1];
      const c = crossing[g];
      if (above === undefined || below === undefined || c === undefined) continue;
      const need = CHANNEL_BASE + c * CHANNEL_LANE;
      cumulative += Math.max(0, need - (below.lo - above.hi));
      shiftForBand[g + 1] = cumulative;
    }
    const out = new Map<SceneNodeId, number>();
    for (const n of scene.nodes) {
      const bi = bandOf.get(topAncestor(n.id));
      if (bi === undefined) continue;
      const s = shiftForBand[bi];
      if (s === undefined || s === 0) continue; // 0 = this band doesn't move
      out.set(n.id, s);
    }
    return out;
  };
  const dy = shiftsForAxis(true);
  const dx = shiftsForAxis(false);
  if (dy.size === 0 && dx.size === 0) return scene;
  let maxX = 0;
  let maxY = 0;
  const nodes = scene.nodes.map((n): SceneNode => {
    const sx = dx.get(n.id); // absent = this node's band stays put on x …
    const sy = dy.get(n.id); // … and on y
    const nx = sx === undefined ? n.bounds.origin.x : n.bounds.origin.x + sx;
    const ny = sy === undefined ? n.bounds.origin.y : n.bounds.origin.y + sy;
    maxX = Math.max(maxX, nx + n.bounds.size.width);
    maxY = Math.max(maxY, ny + n.bounds.size.height);
    return { ...n, bounds: { origin: point(nx, ny), size: n.bounds.size } };
  });
  return {
    ...scene,
    nodes,
    extent: rect(0, 0, maxX + CHANNEL_MARGIN, maxY + CHANNEL_MARGIN),
  };
};

// The position-respecting routing core: port-spread every box→box edge into distinct lanes, detour around
// nodes, then minimise crossings and de-stack overlaps. Moves NO node — callers decide whether to reserve
// channel room first. Shared by initial layout (`spreadPorts`) and post-drag re-routing (`respreadPorts`).
const routeSpread = (scene: Scene, bus: boolean): Scene => {
  const boxOf = boxOfNode(scene);
  const along = (side: Side, other: RouteBox): number =>
    side === "L" || side === "R" ? other.y + other.h / 2 : other.x + other.w / 2;
  const stubs = scene.edges.map((e): { from: PortStub; to: PortStub } | null => {
    const a = boxOf.get(e.from);
    const b = boxOf.get(e.to);
    if (a === undefined || b === undefined || e.from === e.to) return null;
    const fs = facingSide(a, b);
    const ts = facingSide(b, a);
    return {
      from: { key: `${e.from}:${fs}`, perp: along(fs, b) },
      to: { key: `${e.to}:${ts}`, perp: along(ts, a) },
    };
  });
  const lanes = new Map<string, PortStub[]>();
  const addToLane = (stub: PortStub): void => {
    const g = lanes.get(stub.key);
    if (g === undefined) lanes.set(stub.key, [stub]);
    else g.push(stub);
  };
  for (const s of stubs) {
    if (s === null) continue;
    addToLane(s.from);
    addToLane(s.to);
  }
  const rankOf = new Map<PortStub, { readonly rank: number; readonly count: number }>();
  for (const group of lanes.values()) {
    group.sort((x, y) => x.perp - y.perp);
    group.forEach((stub, i) => {
      rankOf.set(stub, { rank: i, count: group.length });
    });
  }
  // Per-edge obstacles (leaf nodes, plus any group container the edge doesn't enter) — so a spread route
  // also keeps out of groups it doesn't belong to.
  const obstacleBoxes = obstaclesForEdges(scene);
  const edges = scene.edges.map((e, i): SceneEdge => {
    const s = stubs[i];
    const a = boxOf.get(e.from);
    const b = boxOf.get(e.to);
    if (s === null || s === undefined || a === undefined || b === undefined) return e;
    const fr = rankOf.get(s.from);
    const tr = rankOf.get(s.to);
    if (fr === undefined || tr === undefined) return e;
    const fs = facingSide(a, b);
    const p0 = portAt(a, fs, fr.rank, fr.count);
    const p3 = portAt(b, facingSide(b, a), tr.rank, tr.count);
    // The two facing sides are opposite on the dominant axis, so the path is a clean Z (h or v): the two
    // mid points sit on the central cross-channel leg. Stagger that leg per source-lane so parallel edges
    // (e.g. several A→B) don't lay their cross-channel legs on top of each other; clamp into the gap so
    // the leg stays between the two boxes.
    const horizontal = fs === "L" || fs === "R";
    const span = horizontal ? Math.abs(p3.x - p0.x) : Math.abs(p3.y - p0.y);
    const raw = (fr.rank - (fr.count - 1) / 2) * CHANNEL_GAP;
    const limit = (span / 2) * 0.6;
    const off = Math.max(-limit, Math.min(limit, raw));
    const midX = (p0.x + p3.x) / 2 + (horizontal ? off : 0);
    const midY = (p0.y + p3.y) / 2 + (horizontal ? 0 : off);
    const sm1 = horizontal ? point(midX, p0.y) : point(p0.x, midY);
    const sm2 = horizontal ? point(midX, p3.y) : point(p3.x, midY);
    const obstacles = obstacleBoxes.get(e.id) ?? [];
    // Clean staggered route (the overwhelming common case) — unchanged, so clean diagrams don't move.
    if (routeHits([p0, sm1, sm2, p3], obstacles) === 0) {
      const labelPos = e.labelPos === null ? null : point((sm1.x + sm2.x) / 2, (sm1.y + sm2.y) / 2);
      return { ...e, waypoints: twoOrMore(p0, sm1, sm2, p3), labelPos };
    }
    // The route would cut through a node. Prefer the maze router (general multi-bend detours); if it
    // can't find a clear orthogonal path, fall back to the local two-topology channel repair.
    const maze = mazeRoute(p0, p3, obstacles, OBSTACLE_CLEARANCE);
    if (maze !== null && maze.length >= 2 && routeHits(maze, obstacles) === 0) {
      const [w0, w1, ...wr] = maze;
      if (w0 !== undefined && w1 !== undefined) {
        const labelPos = e.labelPos === null ? null : pathMidpoint(maze);
        return { ...e, waypoints: twoOrMore(w0, w1, ...wr), labelPos };
      }
    }
    const { m1, m2 } = avoidObstacles(p0, p3, sm1, sm2, horizontal, obstacles);
    const labelPos = e.labelPos === null ? null : point((m1.x + m2.x) / 2, (m1.y + m2.y) / 2);
    return { ...e, waypoints: twoOrMore(p0, m1, m2, p3), labelPos };
  });
  const wired = { ...scene, edges };
  // BUS mode keeps the staggered routes as-is: connectors to a shared endpoint already run along common
  // channel legs, so leaving them coincident forms a shared "backbone" (the renderer marks the junctions
  // where edges branch off it). The default instead minimises crossings then de-stacks the overlaps onto
  // separate lanes — the two complementary passes that give the clean parallel look.
  return bus ? wired : separateOverlaps(minimizeCrossings(wired));
};

// Initial layout: reserve channel room (moving bands apart by edge density) then route (default, no bus).
export const spreadPorts = (rawScene: Scene): Scene =>
  routeSpread(reserveChannels(rawScene), false);

// Re-route at the user's exact node positions (no channel reservation — that would move their nodes). The
// default gives a hand-arranged diagram the same clean parallel connectors as auto-layout; `bus` instead
// leaves connectors sharing a backbone for the junction/bus rendering option.
export const respreadPorts = (scene: Scene, bus = false): Scene => routeSpread(scene, bus);

// The midpoint of an orthogonal route's central cross-channel leg (p1→p2). That leg sits in the gap
// between the two boxes by construction, so an edge label anchored here stays clear of both endpoints —
// unlike the whole-route midpoint (`edgeLabelAnchor`), which can land on a box's border row/column.
export const routeChannelMid = (route: readonly [Point, Point, Point, Point]): Point => {
  const p1 = route[1];
  const p2 = route[2];
  return point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
};

// Whether every segment of a route is axis-aligned (horizontal or vertical) within a small tolerance —
// i.e. already a clean right-angle path. A diagonal segment (the blend a manual move leaves on a
// boundary-crossing edge) makes this false.
const ROUTE_EPS = 0.75;
const isOrthogonalRoute = (waypoints: readonly Point[]): boolean => {
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    if (
      a !== undefined &&
      b !== undefined &&
      Math.abs(a.x - b.x) > ROUTE_EPS &&
      Math.abs(a.y - b.y) > ROUTE_EPS
    )
      return false;
  }
  return true;
};

// Re-route every *non-orthogonal, non-curved* connector as a right-angle path between its endpoints'
// current boxes, leaving already-clean and intentionally-curved (mindmap/gitGraph) edges untouched.
// Use after a manual move blends a boundary-crossing edge into a long diagonal: the nodes stay exactly
// where they are and only the messy connectors snap back to clean right angles. Returns the *same* scene
// object when nothing needed routing, so callers can cheaply detect a no-op.
export const retidyRoutes = (scene: Scene): Scene => {
  const boxOf = new Map(scene.nodes.map((n) => [n.id, n.bounds]));
  let changed = false;
  const edges = scene.edges.map((edge): SceneEdge => {
    if (edge.curved || isOrthogonalRoute(edge.waypoints)) return edge;
    const a = boxOf.get(edge.from);
    const b = boxOf.get(edge.to);
    if (a === undefined || b === undefined) return edge;
    const [w0, w1, w2, w3] = orthogonalRoute(
      { x: a.origin.x, y: a.origin.y, w: a.size.width, h: a.size.height },
      { x: b.origin.x, y: b.origin.y, w: b.size.width, h: b.size.height },
    );
    changed = true;
    return { ...edge, waypoints: twoOrMore(w0, w1, w2, w3) };
  });
  return changed ? { ...scene, edges } : scene;
};
