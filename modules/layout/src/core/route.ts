import { point, rect, twoOrMore, type Point, type TwoOrMore } from "@m/std";
import type { EdgeEnd, Scene, SceneEdge, SceneNode, SceneNodeId } from "@m/contracts";
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
  fromBox: RouteBox | null = null,
  toBox: RouteBox | null = null,
): TwoOrMore<Point> => {
  const pts = raw.map((p) => point(p.x, p.y));
  const [first, second, ...rest] = pts;
  const initial =
    first !== undefined && second !== undefined
      ? twoOrMore(first, second, ...rest)
      : twoOrMore(fromCenter, toCenter);

  const snapped = [...initial];
  if (fromBox !== null && snapped.length >= 2) {
    const s = snapped[1];
    if (s !== undefined) {
      snapped[0] = snapToMountPoint(fromBox, s);
    }
  }
  if (toBox !== null && snapped.length >= 2) {
    const lastIdx = snapped.length - 1;
    const prev = snapped[lastIdx - 1];
    if (prev !== undefined) {
      snapped[lastIdx] = snapToMountPoint(toBox, prev);
    }
  }

  const [w0, w1, ...wr] = snapped;
  if (w0 !== undefined && w1 !== undefined) {
    return twoOrMore(w0, w1, ...wr);
  }
  return initial;
};

const snapToMountPoint = (box: RouteBox, ref: Point): Point => {
  const mounts = sideMounts(box);
  let best = mounts[0] ?? point(0, 0);
  let minD = Infinity;
  for (const p of mounts) {
    if (p === undefined) continue;
    const dx = p.x - ref.x;
    const dy = p.y - ref.y;
    const d = dx * dx + dy * dy;
    if (d < minD) {
      minD = d;
      best = p;
    }
  }
  return best;
};

const alignAdjacentToMount = (box: RouteBox, mount: Point, adjacent: Point): Point => {
  if (Math.abs(mount.x - box.x) < 1e-6 || Math.abs(mount.x - (box.x + box.w)) < 1e-6) {
    return point(adjacent.x, mount.y);
  }
  return point(mount.x, adjacent.y);
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

const CONTAINER_TITLE_CHAR_WIDTH = 7;
const CONTAINER_TITLE_PADDING = 18;
const CONTAINER_TITLE_HEIGHT = 18;
const CONTAINER_TITLE_Y = 3;

export const containerHeaderBox = (box: RouteBox, label: string): RouteBox => ({
  x:
    box.x +
    (box.w - Math.min(box.w, label.length * CONTAINER_TITLE_CHAR_WIDTH + CONTAINER_TITLE_PADDING)) /
      2,
  y: box.y + CONTAINER_TITLE_Y,
  w: Math.min(box.w, label.length * CONTAINER_TITLE_CHAR_WIDTH + CONTAINER_TITLE_PADDING),
  h: Math.min(CONTAINER_TITLE_HEIGHT, box.h),
});

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

// Choose the optimal pair of mount points (top, bottom, left, right) on two bounding boxes
// that minimizes the Euclidean distance between them.
export const optimalMountPoints = (a: RouteBox, b: RouteBox): [Point, Point] => {
  const mountA: [Point, Point, Point, Point] = [
    point(a.x + a.w / 2, a.y),
    point(a.x + a.w / 2, a.y + a.h),
    point(a.x, a.y + a.h / 2),
    point(a.x + a.w, a.y + a.h / 2),
  ];
  const mountB: [Point, Point, Point, Point] = [
    point(b.x + b.w / 2, b.y),
    point(b.x + b.w / 2, b.y + b.h),
    point(b.x, b.y + b.h / 2),
    point(b.x + b.w, b.y + b.h / 2),
  ];
  let minD = Infinity;
  let bestA = mountA[0];
  let bestB = mountB[0];
  for (const pa of mountA) {
    if (pa === undefined) continue;
    for (const pb of mountB) {
      if (pb === undefined) continue;
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const d = dx * dx + dy * dy;
      if (d < minD) {
        minD = d;
        bestA = pa;
        bestB = pb;
      }
    }
  }
  return [bestA, bestB];
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
const mountAt = (box: RouteBox, side: Side): Point => {
  if (side === "R") return point(box.x + box.w, box.y + box.h / 2);
  if (side === "L") return point(box.x, box.y + box.h / 2);
  if (side === "B") return point(box.x + box.w / 2, box.y + box.h);
  return point(box.x + box.w / 2, box.y);
};
const sideNormal = (side: Side): readonly [number, number] => {
  if (side === "R") return [1, 0];
  if (side === "L") return [-1, 0];
  if (side === "B") return [0, 1];
  return [0, -1];
};
const offsetOutside = (p: Point, side: Side, gap: number): Point => {
  const [dx, dy] = sideNormal(side);
  return point(p.x + dx * gap, p.y + dy * gap);
};
const compactPoints = (pts: readonly Point[]): Point[] => {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last === undefined || Math.abs(last.x - p.x) >= 0.5 || Math.abs(last.y - p.y) >= 0.5) {
      out.push(p);
    }
  }
  return out;
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
export const pathMidpoint = (pts: readonly Point[]): Point => {
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
export const routeBoxOf = (n: Scene["nodes"][number]): RouteBox => ({
  x: n.bounds.origin.x,
  y: n.bounds.origin.y,
  w: n.bounds.size.width,
  h: n.bounds.size.height,
});

// Per-edge obstacle boxes — what an edge should avoid. A leaf node is an obstacle unless it's an
// endpoint. A group CONTAINER is an obstacle UNLESS the edge enters it (an endpoint is that container or
// nested inside it), so edges keep out of groups they don't belong to but can still reach an element
// inside one. Even for entered containers, the title label remains an obstacle unless the container itself
// is an endpoint: edges to members should not cut through the visible group label. A tendency, not a
// guarantee: if no clear route exists, the routers fall back.
export const obstaclesForEdges = (scene: Scene): Map<string, readonly RouteBox[]> => {
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
      const enteredHeaders = scene.nodes
        .filter(
          (n) => n.shape === "container" && n.id !== e.from && n.id !== e.to && entered.has(n.id),
        )
        .map((n) => containerHeaderBox(routeBoxOf(n), n.label));
      return [e.id, [...boxes, ...enteredHeaders]];
    }),
  );
};

// The four side-centre mount points of a box (right, left, bottom, top) — so a detour can leave/enter a
// node on whichever side gives the clearest route, instead of always the one the layout first picked.
export const sideMounts = (b: RouteBox): readonly Point[] => [
  point(b.x + b.w, b.y + b.h / 2),
  point(b.x, b.y + b.h / 2),
  point(b.x + b.w / 2, b.y + b.h),
  point(b.x + b.w / 2, b.y),
];

// Every distinct maze route between the two boxes' (from-side, to-side) mount-point pairs, sorted by
// fewest obstacle hits, then fewest bends, then shortest — the shared candidate list behind
// `mazeAroundObstacles` (which takes the head) and `rerouteBoxEdges` (which re-ranks the best-hits
// group by on-screen badness).
export interface MazePathCandidate {
  readonly path: readonly Point[];
  readonly hits: number;
  readonly len: number;
  readonly bends: number;
}

export const mazePathCandidates = (
  fromBox: RouteBox | null,
  toBox: RouteBox | null,
  start: Point,
  end: Point,
  obstacles: readonly RouteBox[],
): MazePathCandidate[] => {
  const starts = fromBox === null ? [start] : sideMounts(fromBox);
  const ends = toBox === null ? [end] : sideMounts(toBox);

  const candidates: MazePathCandidate[] = [];
  const seenPaths = new Set<string>();

  for (const s of starts) {
    for (const t of ends) {
      const maze = mazeRoute(s, t, obstacles, OBSTACLE_CLEARANCE);
      if (maze === null || maze.length < 2) continue;

      const key = maze.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(";");
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);

      const hits = routeHits(maze, obstacles);
      const len = routeLength(maze);
      const bends = maze.length;
      candidates.push({ path: maze, hits, len, bends });
    }
  }

  candidates.sort((a, b) => {
    if (a.hits !== b.hits) return a.hits - b.hits;
    if (a.bends !== b.bends) return a.bends - b.bends;
    return a.len - b.len;
  });
  return candidates;
};

// Route an obstacle-crossing edge with the maze router, trying every (from-side, to-side) mount-point
// pair and keeping the path with the fewest obstacle hits, then the shortest. Returns null when the
// edge already clears everything or no better orthogonal path is found.
export const mazeAroundObstacles = (
  fromBox: RouteBox | null,
  toBox: RouteBox | null,
  start: Point,
  end: Point,
  current: readonly Point[],
  obstacles: readonly RouteBox[],
  routeOption: number | null = null,
  // When true, search for a route even if `current` clears every obstacle — the caller has another
  // reason to want alternatives (e.g. the current route HUGS a border though it doesn't cross a node).
  force = false,
): readonly Point[] | null => {
  if (!force && routeOption === null && routeHits(current, obstacles) === 0) return null;
  const candidates = mazePathCandidates(fromBox, toBox, start, end, obstacles);
  if (candidates.length === 0) return null;
  if (routeOption === null) {
    return candidates[0]?.path ?? null;
  }
  const idx = Math.max(0, routeOption) % candidates.length;
  return candidates[idx]?.path ?? null;
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

// De-collide mid-edge labels on dense diagrams: where a label (placed at its `labelPos`) would overlap
// another label or a node box, move it to the NEAREST clear spot — searching outward first in the four
// cardinal directions (so it follows the edge, smallest displacement), then diagonally. Greedy and
// order-stable; a label that fits is left exactly where the router put it (a no-op when nothing
// overlaps). Only edges with a label AND an explicit `labelPos` participate (a null one is anchored
// later by the renderer). `measure` is the pure text metric the layout already uses. Every position —
// including the give-up fallback — is clamped to the sheet, so a label can never clip off the extent.
const LABEL_HEIGHT = 16;
const LABEL_X_PAD = 8; // horizontal padding folded into a label's measured width
const LABEL_GAP = 4; // minimum clear gap kept between a label and any other label or box
const DECOLLIDE_STEP = 6;
const DECOLLIDE_MAX = 140; // give up past this displacement and leave the label put
const DECOLLIDE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const CONTAINER_BORDER_W = 2; // a related group's border, as a thin strip a label must not straddle

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

  const overlapsBox = (cx: number, cy: number, halfW: number, b: RouteBox): boolean =>
    cx - halfW < b.x + b.w + LABEL_GAP &&
    cx + halfW > b.x - LABEL_GAP &&
    cy - LABEL_HEIGHT / 2 < b.y + b.h + LABEL_GAP &&
    cy + LABEL_HEIGHT / 2 > b.y - LABEL_GAP;

  const borderStrips = (b: RouteBox): RouteBox[] => [
    { x: b.x, y: b.y, w: b.w, h: CONTAINER_BORDER_W },
    { x: b.x, y: b.y + b.h - CONTAINER_BORDER_W, w: b.w, h: CONTAINER_BORDER_W },
    { x: b.x, y: b.y, w: CONTAINER_BORDER_W, h: b.h },
    { x: b.x + b.w - CONTAINER_BORDER_W, y: b.y, w: CONTAINER_BORDER_W, h: b.h },
  ];

  const nodesMap = new Map<string, SceneNode>(scene.nodes.map((n) => [n.id, n]));

  const edges = scene.edges.map((e): SceneEdge => {
    const anchor = e.labelPos;
    if (e.label === null || anchor === null) return e;

    // A label may live INSIDE the endpoints' enclosing containers (that's its natural home), so those
    // are not whole-box obstacles — but their border strips and title bands are, so a label never
    // straddles a group's outline or sits on its title. Every other node box — INCLUDING the endpoint
    // leaves — is a full obstacle: a label stamped on its own edge's node ("filtered" over the Internet
    // box) reads as a bug just as much as one on an unrelated node.
    const related = new Set<string>();
    const addAncestors = (id: string): void => {
      const leaf = nodesMap.get(id);
      let cur = leaf?.parent != null ? nodesMap.get(leaf.parent) : undefined;
      while (cur !== undefined) {
        related.add(cur.id);
        cur = cur.parent !== null ? nodesMap.get(cur.parent) : undefined;
      }
    };
    addAncestors(e.from);
    addAncestors(e.to);
    const isEndpoint = (id: string): boolean => id === e.from || id === e.to;

    const obstacles: RouteBox[] = [];
    for (const n of scene.nodes) {
      if (n.role === "marker") continue; // invisible hit regions occupy no visual space
      const box = routeBoxOf(n);
      if (related.has(n.id) || (isEndpoint(n.id) && n.shape === "container")) {
        obstacles.push(containerHeaderBox(box, n.label), ...borderStrips(box));
        continue;
      }
      obstacles.push(box);
    }
    const halfW = (measure(e.label) + LABEL_X_PAD) / 2;

    // Sheet clamp: the label box (plus its clear gap) must stay inside the extent. A sheet narrower
    // than the label can't be satisfied — then the clamp is skipped rather than inverted.
    const ex = scene.extent.origin.x;
    const ey = scene.extent.origin.y;
    const loX = ex + halfW + LABEL_GAP;
    const hiX = ex + scene.extent.size.width - halfW - LABEL_GAP;
    const loY = ey + LABEL_HEIGHT / 2 + LABEL_GAP;
    const hiY = ey + scene.extent.size.height - LABEL_HEIGHT / 2 - LABEL_GAP;
    const clampX = (v: number): number => (hiX < loX ? v : Math.min(hiX, Math.max(loX, v)));
    const clampY = (v: number): number => (hiY < loY ? v : Math.min(hiY, Math.max(loY, v)));
    const onSheet = (cx: number, cy: number): boolean => clampX(cx) === cx && clampY(cy) === cy;

    const ax: number = clampX(anchor.x);
    const ay: number = clampY(anchor.y);

    const fits = (cx: number, cy: number, hw: number): boolean =>
      onSheet(cx, cy) &&
      placed.every((p) => !overlaps(cx, cy, hw, p)) &&
      obstacles.every((b) => !overlapsBox(cx, cy, hw, b));

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
    // Always adopt the computed position — it carries the on-sheet clamp and the off-line nudge even
    // when no decollision was needed.
    return { ...e, labelPos: point(cx, cy) };
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

const countConflicts = (
  path: readonly Point[],
  others: ReadonlyArray<readonly [Point, Point]>,
): [number, number] => {
  let crossings = 0;
  let overlaps = 0;
  for (const [a, b] of segmentsOf(path)) {
    for (const [c, d] of others) {
      if (orthSegmentsCross(a, b, c, d)) crossings++;
      else if (orthSegmentsOverlap(a, b, c, d)) overlaps++;
    }
  }
  return [crossings, overlaps];
};

const MAX_CROSS_SWEEPS = 3;
const MAX_CROSS_KICKS = 6; // iterated-local-search restarts when the greedy stalls with crossings left
const CROSSING_COST = 10; // cost penalty per perpendicular crossing in length pixels
const OVERLAP_COST = 150; // cost penalty per parallel overlap in length pixels

const conflictCostBetween = (
  path: readonly Point[],
  others: ReadonlyArray<readonly [Point, Point]>,
): number => {
  const [crossings, overlaps] = countConflicts(path, others);
  return crossings * CROSSING_COST + overlaps * OVERLAP_COST;
};

const totalConflictCost = (edges: readonly SceneEdge[]): number => {
  const segs = edges.map((e) => segmentsOf(e.waypoints));
  let cost = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const si = segs[i];
      const sj = segs[j];
      if (si === undefined || sj === undefined) continue;
      for (const [a, b] of si)
        for (const [c, d] of sj) {
          if (orthSegmentsCross(a, b, c, d)) cost += CROSSING_COST;
          else if (orthSegmentsOverlap(a, b, c, d)) cost += OVERLAP_COST;
        }
    }
  }
  return cost;
};

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
        cross: conflictCostBetween(route, others),
        len: routeLength(route),
      });
    }
  }
  out.sort(
    (a, b) =>
      a.hits - b.hits || a.cross * CROSSING_COST + a.len - (b.cross * CROSSING_COST + b.len),
  );
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
      if (top !== undefined) {
        const curScore = conflictCostBetween(e.waypoints, others) + routeLength(e.waypoints);
        const topScore = top.cross + top.len;
        if (top.hits < curHits || (top.hits === curHits && topScore < curScore)) {
          edges[i] = applyRoute(e, top.wp);
          improved = true;
        }
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
const totalLength = (edges: readonly SceneEdge[]): number =>
  edges.reduce((acc, e) => acc + routeLength(e.waypoints), 0);

export const minimizeCrossings = (scene: Scene): Scene => {
  const initial = totalConflicts(scene.edges);
  if (initial === 0) return scene;
  const obstacleBoxes = obstaclesForEdges(scene);
  const boxById = new Map<string, RouteBox>(scene.nodes.map((n) => [n.id, routeBoxOf(n)]));
  const maze = cachedMaze(new Map()); // memo shared across every sweep + kick of this run
  let bestEdges = greedyReduce(scene.edges, obstacleBoxes, boxById, maze);
  let bestScore = totalConflictCost(bestEdges) + totalLength(bestEdges);
  let bestN = totalConflicts(bestEdges);
  // Scale the (costlier) iterated-local-search down on pathologically dense graphs — the greedy already
  // ran; many full-span crossings would otherwise multiply the work without much payoff.
  const kicks = initial > 40 ? 1 : MAX_CROSS_KICKS;
  for (let kick = 0; kick < kicks && bestN > 0; kick++) {
    const perturbed = perturb(bestEdges, kick, obstacleBoxes, boxById, maze);
    if (perturbed === null) break;
    const reduced = greedyReduce(perturbed, obstacleBoxes, boxById, maze);
    const score = totalConflictCost(reduced) + totalLength(reduced);
    if (score < bestScore) {
      bestEdges = reduced;
      bestScore = score;
      bestN = totalConflicts(reduced);
    }
  }
  return { ...scene, edges: bestEdges };
};

const LANE_GAP = 14; // perpendicular separation between de-stacked parallel edge segments
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
const CHANNEL_LANE = 19; // scales with LANE_GAP (≈ LANE_GAP + 5) so reserved channels fit the lanes
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
// BUS routing keeps edges to a shared endpoint coincident on a backbone, so the non-shared parallels
// that remain read as clutter when they sit at the tight default stagger. Give bus mode a wider lane
// separation and a deeper first stub, so parallel runs are visibly distinct and every line leaves its
// node farther before turning — keeping the backbones off node/group borders.
const BUS_LANE_GAP = 22;
const BUS_CHANNEL_GAP = 20;

const routeSpread = (scene: Scene, bus: boolean): Scene => {
  const laneGap = bus ? BUS_LANE_GAP : LANE_GAP;
  const channelGap = bus ? BUS_CHANNEL_GAP : CHANNEL_GAP;
  const boxOf = boxOfNode(scene);
  const parentOf = new Map<string, string | null>(scene.nodes.map((n) => [n.id, n.parent]));
  const ancestorsOf = (id: string): ReadonlySet<string> => {
    const out = new Set<string>();
    let p = parentOf.get(id) ?? null;
    for (let depth = 0; p !== null && depth < MAX_NEST_DEPTH; depth++) {
      out.add(p);
      p = parentOf.get(p) ?? null;
    }
    return out;
  };
  const orientationBox = (id: string, other: string, own: RouteBox): RouteBox => {
    const parent = parentOf.get(id) ?? null;
    if (parent === null) return own;
    if ((parentOf.get(other) ?? null) === parent || ancestorsOf(other).has(parent)) return own;
    return boxOf.get(parent) ?? own;
  };
  const along = (side: Side, other: RouteBox): number =>
    side === "L" || side === "R" ? other.y + other.h / 2 : other.x + other.w / 2;
  const stubs = scene.edges.map(
    (e): { from: PortStub; to: PortStub; fs: Side; ts: Side } | null => {
      const a = boxOf.get(e.from);
      const b = boxOf.get(e.to);
      if (a === undefined || b === undefined || e.from === e.to) return null;
      const ar = orientationBox(e.from, e.to, a);
      const br = orientationBox(e.to, e.from, b);
      const fs = facingSide(ar, br);
      const ts = facingSide(br, ar);
      return {
        from: { key: `${e.from}:${fs}`, perp: along(fs, br) },
        to: { key: `${e.to}:${ts}`, perp: along(ts, ar) },
        fs,
        ts,
      };
    },
  );
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
    const fs = s.fs;
    // Every edge attaches at the SIDE-CENTRE mount (never a spread fraction that creeps toward a corner,
    // and never a segment sliding along the border). Parallel edges separate in two dimensions AWAY from
    // the node: a per-rank staggered stub depth (so they turn at different distances) and a per-rank
    // staggered cross-channel leg — the fan leaves the shared mount cleanly instead of hugging the side.
    const p0 = mountAt(a, fs);
    const p3 = mountAt(b, s.ts);
    const stub0 = channelGap + fr.rank * laneGap;
    const stub3 = channelGap + tr.rank * laneGap;
    const exit0 = offsetOutside(p0, fs, stub0);
    const exit3 = offsetOutside(p3, s.ts, stub3);
    // The two facing sides are opposite on the dominant axis, so the path is a clean Z (h or v). Stagger
    // the central cross leg per source-lane so parallel edges don't lie on top of each other; clamp it
    // into the gap so the leg stays between the two boxes.
    const horizontal = fs === "L" || fs === "R";
    const span = horizontal ? Math.abs(exit3.x - exit0.x) : Math.abs(exit3.y - exit0.y);
    const raw = (fr.rank - (fr.count - 1) / 2) * laneGap;
    const limit = (span / 2) * 0.7;
    const off = Math.max(-limit, Math.min(limit, raw));
    const midX = (exit0.x + exit3.x) / 2 + (horizontal ? off : 0);
    const midY = (exit0.y + exit3.y) / 2 + (horizontal ? 0 : off);
    const sm1 = horizontal ? point(midX, exit0.y) : point(exit0.x, midY);
    const sm2 = horizontal ? point(midX, exit3.y) : point(exit3.x, midY);
    const lane0 = exit0;
    const lane3 = exit3;
    const obstacles = obstacleBoxes.get(e.id) ?? [];
    const direct = compactPoints([p0, exit0, sm1, sm2, exit3, p3]);
    // Clean staggered route (the overwhelming common case) — unchanged, so clean diagrams don't move.
    if (routeHits(direct, obstacles) === 0) {
      const labelPos = e.labelPos === null ? null : point((sm1.x + sm2.x) / 2, (sm1.y + sm2.y) / 2);
      const [w0, w1, ...wr] = direct;
      if (w0 !== undefined && w1 !== undefined)
        return { ...e, waypoints: twoOrMore(w0, w1, ...wr), labelPos };
    }
    // The route would cut through a node. Prefer the maze router (general multi-bend detours); if it
    // can't find a clear orthogonal path, fall back to the local two-topology channel repair.
    const maze = mazeRoute(lane0, lane3, obstacles, OBSTACLE_CLEARANCE);
    if (maze !== null && maze.length >= 2) {
      const routed = compactPoints([p0, exit0, ...maze, exit3, p3]);
      if (routeHits(routed, obstacles) === 0) {
        const [w0, w1, ...wr] = routed;
        if (w0 !== undefined && w1 !== undefined) {
          const labelPos = e.labelPos === null ? null : pathMidpoint(routed);
          return { ...e, waypoints: twoOrMore(w0, w1, ...wr), labelPos };
        }
      }
    }
    const { m1, m2 } = avoidObstacles(lane0, lane3, sm1, sm2, horizontal, obstacles);
    const fallback = compactPoints([p0, exit0, lane0, m1, m2, lane3, exit3, p3]);
    const labelPos = e.labelPos === null ? null : point((m1.x + m2.x) / 2, (m1.y + m2.y) / 2);
    const [w0, w1, ...wr] = fallback;
    if (w0 !== undefined && w1 !== undefined) {
      return { ...e, waypoints: twoOrMore(w0, w1, ...wr), labelPos };
    }
    return e;
  });
  const wired = { ...scene, edges };
  // BUS mode keeps the staggered routes as-is: connectors to a shared endpoint already run along common
  // channel legs, so leaving them coincident forms a shared "backbone" (the renderer marks the junctions
  // where edges branch off it). The default instead minimises crossings then de-stacks the overlaps onto
  // separate lanes — the two complementary passes that give the clean parallel look.
  const routed = bus ? wired : separateOverlaps(minimizeCrossings(wired));
  return separateIncompatibleBackbones(offsetParallelEdges(snapSceneEdgesToMountPoints(routed)));
};

// Multiple edges between the SAME node pair route mount-to-mount identically and coincide. This is where
// the "incompatible backbone" rule breaks worst — a directed and an undirected edge, or an A→B and a
// B→A, drawn on one line. Spread each such group onto distinct parallel lanes. A whole-route translate
// only separates a STRAIGHT pair (one segment); a bent L-route needs each segment moved perpendicular to
// ITS OWN axis, so we shift every waypoint by the lane offset along each adjacent segment's normal — a
// corner takes both its x- and y-shift, yielding a genuinely parallel offset route that stays orthogonal.
// The mounts slide along their node sides (still valid attach points). Run AFTER the mount snap so the
// snap doesn't pull the group back to the shared centre.
const PARALLEL_GAP = 14;
const AXIS_TOL = 0.5;
const offsetParallelEdges = (scene: Scene): Scene => {
  const groups = new Map<string, number[]>();
  scene.edges.forEach((e, i) => {
    if (e.from === e.to) return;
    const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
    const g = groups.get(key);
    if (g === undefined) groups.set(key, [i]);
    else g.push(i);
  });
  // A mount shifts perpendicular to its first/last segment, so it might slide off a narrow side. Clamp the
  // spread to the tightest half-extent across both endpoints (min of half-width and half-height), minus a
  // small inset — conservative but keeps every mount on its border whichever axis it slides along.
  const halfSpan = new Map<string, number>(
    scene.nodes.map((n) => [n.id, Math.min(n.bounds.size.width, n.bounds.size.height) / 2 - 4]),
  );
  const laneOff = new Map<number, number>();
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    idxs.sort((a, b) => a - b);
    for (const [lane, idx] of idxs.entries()) {
      const e = scene.edges[idx];
      if (e === undefined) continue;
      const limit = Math.max(0, Math.min(halfSpan.get(e.from) ?? 16, halfSpan.get(e.to) ?? 16));
      const raw = (lane - (idxs.length - 1) / 2) * PARALLEL_GAP;
      laneOff.set(idx, Math.max(-limit, Math.min(limit, raw)));
    }
  }
  if (laneOff.size === 0) return scene;
  const edges = scene.edges.map((e, i): SceneEdge => {
    const off = laneOff.get(i);
    if (off === undefined || off === 0) return e;
    const w = e.waypoints;
    // Shift each waypoint perpendicular to every axis-aligned segment it touches (a vertical segment moves
    // its ends in x, a horizontal one in y). A non-orthogonal segment (should not occur on routed edges)
    // has no well-defined normal, so fall back to translating the whole route along its dominant axis.
    let orthogonal = true;
    for (let k = 0; k + 1 < w.length; k++) {
      const a = w[k];
      const b = w[k + 1];
      if (a === undefined || b === undefined) continue;
      if (Math.abs(a.x - b.x) >= AXIS_TOL && Math.abs(a.y - b.y) >= AXIS_TOL) orthogonal = false;
    }
    const first = w[0];
    const last = w[w.length - 1];
    const vertical =
      last === undefined ? false : Math.abs(last.y - first.y) >= Math.abs(last.x - first.x);
    const wp = orthogonal
      ? w.map((p, k) => {
          let dx = 0;
          let dy = 0;
          for (const nb of [w[k - 1], w[k + 1]]) {
            if (nb === undefined) continue;
            if (Math.abs(nb.x - p.x) < AXIS_TOL) dx = off;
            else if (Math.abs(nb.y - p.y) < AXIS_TOL) dy = off;
          }
          return point(p.x + dx, p.y + dy);
        })
      : w.map((p) => (vertical ? point(p.x + off, p.y) : point(p.x, p.y + off)));
    const [w0, w1, ...wr] = wp;
    if (w0 === undefined || w1 === undefined) return e;
    return {
      ...e,
      waypoints: twoOrMore(w0, w1, ...wr),
      labelPos: e.labelPos === null ? null : pathMidpoint(wp),
    };
  });
  return { ...scene, edges };
};

// The router picks each segment's track without regard to edge direction, so a few geometries slip an
// INCOMPATIBLE shared backbone past every earlier pass: collinear stacked nodes whose legs line up, or a
// mixed-direction fan leaving one node along a common stub. The project rule is that a coincident collinear
// segment may carry ≥2 edges only when they are COMPATIBLE — same flow direction, or both undirected —
// never a directed with an undirected one and never two opposite flows. This final pass finds any remaining
// incompatible coincidence and moves one of the two segments onto its own track: it shifts the segment
// perpendicular to its own axis (both endpoints move, so neighbouring legs only lengthen and the route stays
// orthogonal), and where the moved segment carries a MOUNT, that mount slides ALONG the node's side — a
// spread the (relaxed) cardinal-mount invariant now permits — clamped to stay within the side's span. Only
// incompatible coincidences are broken; a compatible shared backbone (the intended bus/trunk look) is kept.
const BACKBONE_TRACK_TOL = 2;
const BACKBONE_OVERLAP_MIN = 8;
const BACKBONE_NUDGE = 12;
const BACKBONE_SCAN_STEPS = 16; // gap-widths outward a conflicting segment may move to find clear track
const BACKBONE_MOUNT_INSET = 4; // keep a slid mount this far from a node corner
const BACKBONE_MAX_PASSES = 200;
const BACKBONE_STALL_LIMIT = 8; // consecutive non-improving escape steps before giving up
const BACKBONE_DISP_CAP = 600; // total nudge displacement budget — stops the search wandering into detours

interface BackboneSeg {
  readonly edgeIdx: number;
  readonly segIdx: number;
  readonly horizontal: boolean;
  readonly track: number;
  readonly lo: number;
  readonly hi: number;
}

// Flow signature of an edge along one axis: "U" if it carries no directional arrowhead, else the sign of
// the flow (source-centre → arrowhead-end) projected onto that axis. Two coincident segments conflict iff
// their signatures on that axis differ. Mirrors the rule oracle and `trunkCompatKey`'s notion.
const flowSignature = (
  e: SceneEdge,
  horizontal: boolean,
  centre: Map<SceneNodeId, Point>,
): string => {
  const into = DIRECTIONAL_ENDS.has(e.toEnd);
  const outOf = DIRECTIONAL_ENDS.has(e.fromEnd);
  if (!into && !outOf) return "U";
  const src = into ? e.from : e.to;
  const dst = into ? e.to : e.from;
  const cs = centre.get(src);
  const cd = centre.get(dst);
  if (cs === undefined || cd === undefined) return "U";
  const delta = horizontal ? cd.x - cs.x : cd.y - cs.y;
  return delta >= 0 ? "P" : "N";
};

const backboneSegments = (edgeIdx: number, w: readonly Point[]): BackboneSeg[] => {
  const out: BackboneSeg[] = [];
  for (let i = 0; i + 1 < w.length; i++) {
    const a = w[i];
    const b = w[i + 1];
    if (a === undefined || b === undefined) continue;
    if (Math.abs(a.y - b.y) < AXIS_TOL && Math.abs(a.x - b.x) >= AXIS_TOL)
      out.push({
        edgeIdx,
        segIdx: i,
        horizontal: true,
        track: (a.y + b.y) / 2,
        lo: Math.min(a.x, b.x),
        hi: Math.max(a.x, b.x),
      });
    else if (Math.abs(a.x - b.x) < AXIS_TOL && Math.abs(a.y - b.y) >= AXIS_TOL)
      out.push({
        edgeIdx,
        segIdx: i,
        horizontal: false,
        track: (a.x + b.x) / 2,
        lo: Math.min(a.y, b.y),
        hi: Math.max(a.y, b.y),
      });
  }
  return out;
};

// Shift one segment (both its endpoints) perpendicular to its own axis; the compaction drops points the
// shift made collinear. A mount (first/last waypoint) thereby slides along its node side.
const nudgeSegment = (
  w: readonly Point[],
  segIdx: number,
  horizontal: boolean,
  delta: number,
): Point[] =>
  compactPoints(
    w.map((p, idx) =>
      idx === segIdx || idx === segIdx + 1
        ? horizontal
          ? point(p.x, p.y + delta)
          : point(p.x + delta, p.y)
        : p,
    ),
  );

const separateIncompatibleBackbones = (scene: Scene): Scene => {
  const centre = new Map<SceneNodeId, Point>(
    scene.nodes.map((n) => [
      n.id,
      point(
        n.bounds.origin.x + n.bounds.size.width / 2,
        n.bounds.origin.y + n.bounds.size.height / 2,
      ),
    ]),
  );
  const boxById = new Map<SceneNodeId, RouteBox>(scene.nodes.map((n) => [n.id, routeBoxOf(n)]));
  const obstacleBoxes = obstaclesForEdges(scene);
  const obstacleFor = (idx: number): readonly RouteBox[] => {
    const e = scene.edges[idx];
    return e === undefined ? [] : (obstacleBoxes.get(e.id) ?? []);
  };
  const sigOf = (idx: number, horizontal: boolean): string => {
    const e = scene.edges[idx];
    return e === undefined ? "U" : flowSignature(e, horizontal, centre);
  };
  // A candidate route is valid only if its two endpoints stay on their nodes' sides (within the span, with
  // a small inset from the corners) — the relaxed cardinal-mount invariant. A slid mount that would leave
  // the side is rejected.
  const onSide = (p: Point, nodeId: SceneNodeId): boolean => {
    const b = boxById.get(nodeId);
    if (b === undefined) return false;
    const onV =
      (Math.abs(p.x - b.x) < 1 || Math.abs(p.x - (b.x + b.w)) < 1) &&
      p.y >= b.y + BACKBONE_MOUNT_INSET &&
      p.y <= b.y + b.h - BACKBONE_MOUNT_INSET;
    const onH =
      (Math.abs(p.y - b.y) < 1 || Math.abs(p.y - (b.y + b.h)) < 1) &&
      p.x >= b.x + BACKBONE_MOUNT_INSET &&
      p.x <= b.x + b.w - BACKBONE_MOUNT_INSET;
    return onV || onH;
  };
  const endpointsOnSide = (idx: number, w: readonly Point[]): boolean => {
    const e = scene.edges[idx];
    const first = w[0];
    const last = w[w.length - 1];
    if (e === undefined || first === undefined || last === undefined) return false;
    return onSide(first, e.from) && onSide(last, e.to);
  };
  const routes: Point[][] = scene.edges.map((e) => [...e.waypoints]);

  const conflictsIn = (rs: readonly Point[][]): number => {
    const segs = rs.flatMap((w, idx) => backboneSegments(idx, w));
    let count = 0;
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const A = segs[i];
        const B = segs[j];
        if (A === undefined || B === undefined) continue;
        if (A.edgeIdx === B.edgeIdx || A.horizontal !== B.horizontal) continue;
        if (Math.abs(A.track - B.track) > BACKBONE_TRACK_TOL) continue;
        if (Math.min(A.hi, B.hi) - Math.max(A.lo, B.lo) <= BACKBONE_OVERLAP_MIN) continue;
        if (sigOf(A.edgeIdx, A.horizontal) !== sigOf(B.edgeIdx, B.horizontal)) count++;
      }
    }
    return count;
  };

  const firstConflict = (): { readonly A: BackboneSeg; readonly B: BackboneSeg } | null => {
    const segs = routes.flatMap((w, idx) => backboneSegments(idx, w));
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const A = segs[i];
        const B = segs[j];
        if (A === undefined || B === undefined) continue;
        if (A.edgeIdx === B.edgeIdx || A.horizontal !== B.horizontal) continue;
        if (Math.abs(A.track - B.track) > BACKBONE_TRACK_TOL) continue;
        if (Math.min(A.hi, B.hi) - Math.max(A.lo, B.lo) <= BACKBONE_OVERLAP_MIN) continue;
        if (sigOf(A.edgeIdx, A.horizontal) !== sigOf(B.edgeIdx, B.horizontal)) return { A, B };
      }
    }
    return null;
  };

  let bestConflicts = conflictsIn(routes);
  let bestRoutes: Point[][] = routes.map((w) => [...w]);
  let disp = 0;
  let bestDisp = 0;
  let stall = 0;
  for (let pass = 0; pass < BACKBONE_MAX_PASSES && bestConflicts > 0; pass++) {
    const conflict = firstConflict();
    if (conflict === null) break;
    const base = conflictsIn(routes);
    // Move either segment, scanning OUTWARD both perpendicular directions to reach empty track. Rank
    // lexicographically by resulting conflict count then displacement — the cheapest resolving move wins.
    const cands = [conflict.A, conflict.B].flatMap((s) =>
      Array.from({ length: BACKBONE_SCAN_STEPS }, (_unused, k) => k + 1).flatMap((mult) =>
        [1, -1].map((dir) => ({ seg: s, delta: dir * mult * BACKBONE_NUDGE })),
      ),
    );
    let pick: {
      readonly edgeIdx: number;
      readonly route: Point[];
      readonly c2: number;
      readonly cost: number;
    } | null = null;
    for (const c of cands) {
      const cur = routes[c.seg.edgeIdx];
      if (cur === undefined) continue;
      const moved = nudgeSegment(cur, c.seg.segIdx, c.seg.horizontal, c.delta);
      if (moved.length < 2) continue;
      if (!endpointsOnSide(c.seg.edgeIdx, moved)) continue;
      if (routeHits(moved, obstacleFor(c.seg.edgeIdx)) > routeHits(cur, obstacleFor(c.seg.edgeIdx)))
        continue;
      const trial = routes.slice();
      trial[c.seg.edgeIdx] = moved;
      const c2 = conflictsIn(trial);
      const cost = c2 * 1_000_000 + Math.abs(c.delta);
      if (pick === null || cost < pick.cost)
        pick = { edgeIdx: c.seg.edgeIdx, route: moved, c2, cost };
    }
    if (pick === null) break; // no admissible move — leave the rest (the fuzzer reports it)
    routes[pick.edgeIdx] = pick.route;
    disp += BACKBONE_NUDGE;
    stall = pick.c2 < base ? 0 : stall + 1;
    const now = conflictsIn(routes);
    if (now < bestConflicts || (now === bestConflicts && disp < bestDisp)) {
      bestConflicts = now;
      bestRoutes = routes.map((w) => [...w]);
      bestDisp = disp;
    }
    if (stall > BACKBONE_STALL_LIMIT || disp > BACKBONE_DISP_CAP) break;
  }
  for (let i = 0; i < routes.length; i++) {
    const b = bestRoutes[i];
    if (b !== undefined) routes[i] = b;
  }

  let changed = false;
  const edges = scene.edges.map((e, i): SceneEdge => {
    const w = routes[i];
    if (w === undefined) return e;
    const same =
      w.length === e.waypoints.length &&
      w.every((p, k) => {
        const q = e.waypoints[k];
        return q !== undefined && p.x === q.x && p.y === q.y;
      });
    if (same) return e;
    changed = true;
    const [w0, w1, ...wr] = w;
    if (w0 === undefined || w1 === undefined) return e;
    return {
      ...e,
      waypoints: twoOrMore(w0, w1, ...wr),
      labelPos: e.labelPos === null ? null : pathMidpoint(w),
    };
  });
  return changed ? { ...scene, edges } : scene;
};

// Initial layout: reserve channel room (moving bands apart by edge density) then route (default, no bus).
export const spreadPorts = (rawScene: Scene): Scene =>
  routeSpread(reserveChannels(rawScene), false);

// Re-route at the user's exact node positions (no channel reservation — that would move their nodes). The
// default gives a hand-arranged diagram the same clean parallel connectors as auto-layout; `bus` instead
// leaves connectors sharing a backbone for the junction/bus rendering option.
export const respreadPorts = (scene: Scene, bus = false): Scene => routeSpread(scene, bus);

const TRUNK_MIN = 2; // a fan needs at least this many edges on one node side to become a trunk
const TRUNK_GAP = 26; // minimum distance from the node to its trunk line

const samePoint = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
const compress = (pts: readonly Point[]): Point[] => {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last === undefined || !samePoint(last, p)) out.push(p);
  }
  return out;
};

// Active trunk merging (the aggressive bus). For each node side that a FAN of ≥ TRUNK_MIN connectors
// reaches, route them all through one shared trunk line just off that side and into a single shared port:
// each edge runs from its far end to the trunk, then along the trunk into the node. The trunk segment is
// shared by the whole fan (a real backbone) and the renderer marks a junction where each edge joins it.
// Ends that denote a flow DIRECTION (an arrowhead), as opposed to ER/UML cardinality glyphs or a plain
// line end — mirrors the renderer's `DIRECTIONAL_ENDS`.
const DIRECTIONAL_ENDS: ReadonlySet<EdgeEnd> = new Set(["arrow", "arrowOpen", "triangle"]);

// A trunk backbone may only merge COMPATIBLE edges. Fans are grouped at the destination node `node`
// (`node === e.to`), so the arrow at `toEnd` points INTO the node and the arrow at `fromEnd` points OUT.
// Two edges share a trunk only when this key matches, so a directed edge never joins an undirected one,
// and an into-node edge never joins an out-of-node one (opposite directions) — they get separate,
// adjacent trunks instead.
const trunkCompatKey = (e: SceneEdge): string => {
  const into = DIRECTIONAL_ENDS.has(e.toEnd);
  const outOf = DIRECTIONAL_ENDS.has(e.fromEnd);
  if (!into && !outOf) return "u"; // undirected
  return `d${into ? "i" : ""}${outOf ? "o" : ""}`;
};
const TRUNK_SEP = 16; // perpendicular gap between two adjacent trunks on the same node side

// Bigger fans claim their edges first; an edge already in one trunk isn't pulled into another. Edges not
// in any fan keep the routes they came in with — so callers pass an already-routed scene.
const trunkMerge = (scene: Scene): Scene => {
  const boxOf = boxOfNode(scene);
  const obstacleBoxes = obstaclesForEdges(scene);
  // node → side → compat-key → edge indices. The compat-key split keeps incompatible edges (directed vs
  // undirected, into-node vs out-of-node) out of a shared trunk.
  const fans = new Map<SceneNodeId, Map<Side, Map<string, number[]>>>();
  const addIncident = (node: SceneNodeId, side: Side, key: string, idx: number): void => {
    let bySide = fans.get(node);
    if (bySide === undefined) {
      bySide = new Map();
      fans.set(node, bySide);
    }
    let byKey = bySide.get(side);
    if (byKey === undefined) {
      byKey = new Map();
      bySide.set(side, byKey);
    }
    const list = byKey.get(key);
    if (list === undefined) byKey.set(key, [idx]);
    else list.push(idx);
  };
  scene.edges.forEach((e, idx) => {
    if (e.from === e.to) return;
    const fb = boxOf.get(e.from);
    const tb = boxOf.get(e.to);
    if (fb === undefined || tb === undefined) return;
    addIncident(e.to, facingSide(tb, fb), trunkCompatKey(e), idx);
  });
  const groups: {
    readonly node: SceneNodeId;
    readonly side: Side;
    readonly edges: readonly number[];
  }[] = [];
  for (const [node, bySide] of fans)
    for (const [side, byKey] of bySide)
      for (const edges of byKey.values())
        if (edges.length >= TRUNK_MIN) groups.push({ node, side, edges });
  groups.sort((a, b) => b.edges.length - a.edges.length);
  // How many trunks already placed on a given node side, so a second compatible group sits in an
  // ADJACENT trunk (offset outward) rather than on top of the first.
  const trunksOnSide = new Map<string, number>();

  const claimed = new Set<number>();
  const routed = new Map<number, TwoOrMore<Point>>();
  for (const g of groups) {
    const free = g.edges.filter((i) => !claimed.has(i));
    if (free.length < TRUNK_MIN) continue;
    const tb = boxOf.get(g.node);
    if (tb === undefined) continue;
    const tPort = mountAt(tb, g.side);
    const vertical = g.side === "L" || g.side === "R";

    const farPorts = free
      .map((idx) => {
        const e = scene.edges[idx];
        if (e === undefined) return null;
        const otherId = e.from === g.node ? e.to : e.from;
        const ob = boxOf.get(otherId);
        if (ob === undefined) return null;
        const oPort = mountAt(ob, facingSide(ob, tb));
        return { idx, e, oPort };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (farPorts.length < TRUNK_MIN) continue;

    // A second compatible group on this same node side is offset OUTWARD (toward the far ports) into an
    // adjacent, parallel trunk — re-clamped so it never passes the far ports.
    const placedKey = `${g.node}:${g.side}`;
    const off = (trunksOnSide.get(placedKey) ?? 0) * TRUNK_SEP;
    trunksOnSide.set(placedKey, (trunksOnSide.get(placedKey) ?? 0) + 1);
    let trunk: number;
    if (g.side === "R") {
      const x0 = tb.x + tb.w;
      const x1 = Math.min(...farPorts.map((p) => p.oPort.x));
      const base = Math.max(x0 + TRUNK_GAP, Math.min(x1 - TRUNK_GAP, (x0 + x1) / 2));
      trunk = Math.min(x1 - TRUNK_GAP, base + off);
    } else if (g.side === "L") {
      const x0 = tb.x;
      const x1 = Math.max(...farPorts.map((p) => p.oPort.x));
      const base = Math.min(x0 - TRUNK_GAP, Math.max(x1 + TRUNK_GAP, (x0 + x1) / 2));
      trunk = Math.max(x1 + TRUNK_GAP, base - off);
    } else if (g.side === "B") {
      const y0 = tb.y + tb.h;
      const y1 = Math.min(...farPorts.map((p) => p.oPort.y));
      const base = Math.max(y0 + TRUNK_GAP, Math.min(y1 - TRUNK_GAP, (y0 + y1) / 2));
      trunk = Math.min(y1 - TRUNK_GAP, base + off);
    } else {
      // "T"
      const y0 = tb.y;
      const y1 = Math.max(...farPorts.map((p) => p.oPort.y));
      const base = Math.min(y0 - TRUNK_GAP, Math.max(y1 + TRUNK_GAP, (y0 + y1) / 2));
      trunk = Math.max(y1 + TRUNK_GAP, base - off);
    }

    for (const { idx, e, oPort } of farPorts) {
      const toTrunk = vertical ? point(trunk, oPort.y) : point(oPort.x, trunk);
      const alongTrunk = vertical ? point(trunk, tPort.y) : point(tPort.x, trunk);

      const approach = mazeRoute(oPort, toTrunk, obstacleBoxes.get(e.id) ?? [], OBSTACLE_CLEARANCE);

      const fromOther =
        approach !== null && approach.length >= 2
          ? compress([...approach, alongTrunk, tPort])
          : compress([oPort, toTrunk, alongTrunk, tPort]);

      const ordered = e.from === g.node ? [...fromOther].reverse() : fromOther;
      const [w0, w1, ...wr] = ordered;
      if (w0 === undefined || w1 === undefined) continue;
      routed.set(idx, twoOrMore(w0, w1, ...wr));
      claimed.add(idx);
    }
  }
  if (routed.size === 0) return scene;
  const edges = scene.edges.map((e, idx): SceneEdge => {
    const wp = routed.get(idx);
    if (wp === undefined) return e;
    return { ...e, waypoints: wp, labelPos: e.labelPos === null ? null : pathMidpoint(wp) };
  });
  return { ...scene, edges };
};

// The trunk rendering option: spread the non-fan connectors normally, then merge each fan onto a shared
// trunk. Like `respreadPorts`, it respects the node positions it's given (no channel reservation).
export const trunkRoutes = (scene: Scene): Scene =>
  separateIncompatibleBackbones(trunkMerge(routeSpread(scene, false)));

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

// Drop interior waypoints whose removal deviates the path by less than `tol` px (Ramer–Douglas–Peucker,
// endpoints fixed — the cardinal-mount invariant only constrains endpoints). Mount clamping and lane
// spreading can disagree by a few pixels, and `alignAdjacentToMount` turns that disagreement into tiny
// Z-shaped stubs right at the arrowheads; a sub-tolerance diagonal is invisible where the stub was loud.
const simplifyMicroJogs = (pts: readonly Point[], tol: number): Point[] => {
  if (pts.length <= 2) return [...pts];
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first === undefined || last === undefined) return [...pts];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.hypot(dx, dy);
  let worst = 0;
  let worstIdx = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    if (p === undefined) continue;
    const d =
      len < 1e-9
        ? Math.hypot(p.x - first.x, p.y - first.y)
        : Math.abs(dy * p.x - dx * p.y + last.x * first.y - last.y * first.x) / len;
    if (d > worst) {
      worst = d;
      worstIdx = i;
    }
  }
  if (worstIdx === -1) return tol > 0 ? [first, last] : [...pts]; // collinear: identity at tol 0
  if (worst < tol) return [first, last];
  const head = simplifyMicroJogs(pts.slice(0, worstIdx + 1), tol);
  const tail = simplifyMicroJogs(pts.slice(worstIdx), tol);
  return [...head.slice(0, -1), ...tail];
};

// Applied only by layoutDiagram's outer snap (see the microJogTol parameter): spreadPorts' own internal
// snap runs with 0 so unit-scale routing tests (and any tiny-geometry caller) keep exact waypoints.
export const MICRO_JOG_TOL = 10;

export const snapSceneEdgesToMountPoints = (scene: Scene, microJogTol = 0): Scene => {
  const boxById = new Map<string, RouteBox>(scene.nodes.map((n) => [n.id, routeBoxOf(n)]));
  const obstacleBoxes = obstaclesForEdges(scene);
  const edges = scene.edges.map((e): SceneEdge => {
    const fromBox = boxById.get(e.from);
    const toBox = boxById.get(e.to);
    if (fromBox === undefined || toBox === undefined || e.from === e.to) return e;
    const pts = [...e.waypoints];
    if (pts.length >= 2) {
      const first = pts[0];
      const second = pts[1];
      if (first !== undefined && second !== undefined) {
        const mount = snapToMountPoint(fromBox, second);
        pts[0] = mount;
        if (pts.length > 2 && !samePoint(first, mount)) {
          pts[1] = alignAdjacentToMount(fromBox, mount, second);
        }
      }
      const lastIdx = pts.length - 1;
      const last = pts[lastIdx];
      const prev = pts[lastIdx - 1];
      if (last !== undefined && prev !== undefined) {
        const mount = snapToMountPoint(toBox, prev);
        pts[lastIdx] = mount;
        if (lastIdx > 1 && !samePoint(last, mount)) {
          pts[lastIdx - 1] = alignAdjacentToMount(toBox, mount, prev);
        }
      }
    }
    if (pts.length === 2) {
      const start = pts[0];
      const end = pts[1];
      // A nearly-axis-aligned diagonal (a few px of drift from mount rounding / lane spreading) reads
      // FAR better as a barely-perceptible straight line than as a tiny Z-shaped stub — only elbow when
      // both deltas are big enough that the elbow looks intentional.
      const ELBOW_MIN = 10;
      if (
        start !== undefined &&
        end !== undefined &&
        Math.abs(start.x - end.x) > ELBOW_MIN &&
        Math.abs(start.y - end.y) > ELBOW_MIN
      ) {
        const firstElbow = point(start.x, end.y);
        const secondElbow = point(end.x, start.y);
        const obstacles = obstacleBoxes.get(e.id) ?? [];
        const firstHits = routeHits([start, firstElbow, end], obstacles);
        const secondHits = routeHits([start, secondElbow, end], obstacles);
        pts.splice(1, 0, firstHits <= secondHits ? firstElbow : secondElbow);
      }
    }
    const compacted = simplifyMicroJogs(compactPoints(pts), microJogTol);
    const [w0, w1, ...wr] = compacted;
    if (w0 !== undefined && w1 !== undefined) {
      const snappedWaypoints = twoOrMore(w0, w1, ...wr);
      return {
        ...e,
        waypoints: snappedWaypoints,
        labelPos: e.labelPos === null ? null : pathMidpoint(snappedWaypoints),
      };
    }
    return e;
  });
  return { ...scene, edges };
};

const BORDER_TOL = 7; // a segment within this of a parallel border counts as "hugging" it
const BORDER_CLEAR = 12; // push a hugging segment this far off the border

interface Border {
  readonly coord: number; // the border's position in the perpendicular axis
  readonly away: 1 | -1; // the direction pointing AWAY from this box's interior (into free space)
}

// Parallel borders (in the perpendicular axis) of every non-endpoint box that overlaps the segment's
// extent, each tagged with the direction AWAY from its box's interior. `horizontal` reads the boxes' y
// edges (top/bottom) over the segment's x-span; vertical reads x edges over the y-span.
const overlappingBorders = (
  a: Point,
  b: Point,
  horizontal: boolean,
  boxes: ReadonlyArray<{ readonly id: string; readonly box: RouteBox }>,
  from: string,
  to: string,
): Border[] => {
  const borders: Border[] = [];
  const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
  const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  for (const { id, box } of boxes) {
    if (id === from || id === to) continue;
    const bLo = horizontal ? box.x : box.y;
    const bHi = horizontal ? box.x + box.w : box.y + box.h;
    if (lo >= bHi - 2 || hi <= bLo + 2) continue; // segment doesn't run alongside this box
    // Near border (top/left) → away is negative (out of the box); far border (bottom/right) → positive.
    borders.push({ coord: horizontal ? box.y : box.x, away: -1 });
    borders.push({ coord: horizontal ? box.y + box.h : box.x + box.w, away: 1 });
  }
  return borders;
};

// The perpendicular shift that lifts an axis-aligned segment off any non-endpoint box border it runs
// ALONG. It always moves AWAY from the hugged box's interior (moving the other way would cross INTO that
// box — the bug that once pushed an edge through a node between its endpoints). If the gap to the next
// border on the away side is too tight for full clearance, it centres the segment in that gap rather
// than hopping onto the next border (which oscillated in narrow channels). 0 if nothing hugs.
//
// Deliberately scoped to HUGGING (tangent-to-a-border) only, not through-node crossings: a local
// perpendicular shift can't route an edge AROUND a node in its way, and trying (an earlier interior-aware
// variant) just relocated crossings elsewhere — that needs the maze router / mount re-selection instead.
const borderHugShift = (
  a: Point,
  b: Point,
  horizontal: boolean,
  boxes: ReadonlyArray<{ readonly id: string; readonly box: RouteBox }>,
  from: string,
  to: string,
): number => {
  const coord = horizontal ? a.y : a.x;
  const borders = overlappingBorders(a, b, horizontal, boxes, from, to);
  let hugged: Border | null = null;
  let huggedDist = BORDER_TOL;
  for (const border of borders) {
    const d = Math.abs(coord - border.coord);
    if (d < huggedDist) {
      huggedDist = d;
      hugged = border;
    }
  }
  if (hugged === null) return 0;
  // Free room on the away side = distance to the nearest border beyond the hugged one that way.
  let gap = Number.POSITIVE_INFINITY;
  for (const border of borders) {
    const delta = (border.coord - hugged.coord) * hugged.away;
    if (delta > 1) gap = Math.min(gap, delta);
  }
  const offset = gap === Number.POSITIVE_INFINITY ? BORDER_CLEAR : Math.min(BORDER_CLEAR, gap / 2);
  return hugged.coord + hugged.away * offset - coord;
};

// Lift edge segments off node/container borders they run ALONG. A channel leg placed exactly on a box's
// edge merges into that box's outline — the obstacle routers never catch it, because running tangent to
// a border isn't crossing it. Only INTERIOR segments move (never the mount-anchored first/last), shifted
// perpendicular into the clear gap; a few passes let a shift that reveals a new hug settle. Endpoints
// stay put, so orthogonality and the mounts are preserved.
export const separateEdgesFromBorders = (scene: Scene): Scene => {
  // Node bodies plus each container's TITLE BAND (a thin box at its top where the group label sits): a
  // segment must clear the band too, and shifting one must never land in it.
  const boxes = scene.nodes.flatMap((n) => {
    const body = { id: n.id, box: routeBoxOf(n) };
    if (n.shape !== "container") return [body];
    return [body, { id: `${n.id}:hdr`, box: containerHeaderBox(routeBoxOf(n), n.label) }];
  });
  const edges = scene.edges.map((e): SceneEdge => {
    if (e.waypoints.length < 4 || e.from === e.to) return e;
    let pts: Point[] = [...e.waypoints];
    let moved = false;
    for (let pass = 0; pass < 3; pass++) {
      let passMoved = false;
      for (let i = 1; i + 1 <= pts.length - 2; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (a === undefined || b === undefined) continue;
        const horizontal = Math.abs(a.y - b.y) < 0.5;
        const vertical = Math.abs(a.x - b.x) < 0.5;
        if (!horizontal && !vertical) continue;
        const shift = borderHugShift(a, b, horizontal, boxes, e.from, e.to);
        if (shift === 0) continue;
        pts[i] = horizontal ? point(a.x, a.y + shift) : point(a.x + shift, a.y);
        pts[i + 1] = horizontal ? point(b.x, b.y + shift) : point(b.x + shift, b.y);
        passMoved = true;
      }
      if (!passMoved) break;
      moved = true;
      pts = compactPoints(pts);
    }
    if (!moved) return e;
    const [w0, w1, ...wr] = pts;
    if (w0 === undefined || w1 === undefined) return e;
    const waypoints = twoOrMore(w0, w1, ...wr);
    return { ...e, waypoints, labelPos: e.labelPos === null ? null : pathMidpoint(waypoints) };
  });
  return { ...scene, edges };
};

interface ScoreBox {
  readonly id: string;
  readonly box: RouteBox;
  readonly container: boolean;
}

const HUG_TOL = 5; // visual "runs along a border" threshold — matches the e2e clearance guard

// A route's VISUAL badness: axis-aligned segments that cross a non-endpoint LEAF node's interior
// (heavily weighted — an edge cutting through a node is the worst) plus segments that hug any box
// border. Hugs are counted against the endpoint LEAVES too: a leg sliding along its own node's border
// into the mount reads as a fault, while a clean perpendicular arrival only touches the border at the
// mount point and never registers. This is exactly the metric the `edge-border-clearance` guard
// measures, so the reroute only accepts a maze detour that is strictly cleaner ON SCREEN — not merely
// by the router's own overlap test (which counts a container-boundary graze the eye doesn't).
const routeBadness = (
  pts: readonly Point[],
  boxes: readonly ScoreBox[],
  from: string,
  to: string,
): number => {
  let crossings = 0;
  let hugs = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a === undefined || b === undefined) continue;
    const horizontal = Math.abs(a.y - b.y) < 0.5;
    const vertical = Math.abs(a.x - b.x) < 0.5;
    if (!horizontal && !vertical) continue;
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    for (const { id, box, container } of boxes) {
      const endpoint = id === from || id === to;
      if (endpoint && container) continue; // a group the edge attaches to is its own geometry
      if (!container && !endpoint) {
        if (
          horizontal &&
          a.y > box.y + 2 &&
          a.y < box.y + box.h - 2 &&
          x0 < box.x + box.w - 2 &&
          x1 > box.x + 2
        ) {
          crossings++;
        }
        if (
          vertical &&
          a.x > box.x + 2 &&
          a.x < box.x + box.w - 2 &&
          y0 < box.y + box.h - 2 &&
          y1 > box.y + 2
        ) {
          crossings++;
        }
      }
      if (horizontal && x0 < box.x + box.w - 3 && x1 > box.x + 3) {
        if (Math.abs(a.y - box.y) < HUG_TOL || Math.abs(a.y - (box.y + box.h)) < HUG_TOL) hugs++;
      }
      if (vertical && y0 < box.y + box.h - 3 && y1 > box.y + 3) {
        if (Math.abs(a.x - box.x) < HUG_TOL || Math.abs(a.x - (box.x + box.w)) < HUG_TOL) hugs++;
      }
    }
  }
  return crossings * 10 + hugs;
};

// The side of `b` whose centre mount `p` sits on, or null when `p` is not a cardinal mount of `b`.
const mountSideOf = (b: RouteBox, p: Point): Side | null => {
  const midX = b.x + b.w / 2;
  const midY = b.y + b.h / 2;
  if (Math.abs(p.x - midX) < 0.6 && Math.abs(p.y - b.y) < 0.6) return "T";
  if (Math.abs(p.x - midX) < 0.6 && Math.abs(p.y - (b.y + b.h)) < 0.6) return "B";
  if (Math.abs(p.y - midY) < 0.6 && Math.abs(p.x - b.x) < 0.6) return "L";
  if (Math.abs(p.y - midY) < 0.6 && Math.abs(p.x - (b.x + b.w)) < 0.6) return "R";
  return null;
};

// Orthodox L- and Z-shaped candidates between every mount pair, with the Z's cross leg scanned across
// (and beyond) the inter-box span. Complements the maze candidates in `rerouteBoxEdges`: the maze
// returns one length-optimal path per mount pair, which on grid-aligned diagrams often runs exactly
// along a sibling's border; these patterns supply the staircase alternatives the maze skipped. Each
// candidate must LEAVE its from-mount outward and ARRIVE at its to-mount perpendicular from outside —
// a sliding (border-parallel) arrival is rejected here rather than scored.
const patternCandidates = (
  fromBox: RouteBox,
  toBox: RouteBox,
  obstacles: readonly RouteBox[],
): MazePathCandidate[] => {
  const out: MazePathCandidate[] = [];
  const seen = new Set<string>();
  const add = (raw: readonly Point[]): void => {
    const pts = compactPoints(raw);
    if (pts.length < 2) return;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (a === undefined || b === undefined) return;
      if (Math.abs(a.x - b.x) >= 0.5 && Math.abs(a.y - b.y) >= 0.5) return; // diagonal — not a pattern
    }
    const s0 = pts[0];
    const s1 = pts[1];
    const tN = pts[pts.length - 1];
    const tP = pts[pts.length - 2];
    if (s0 === undefined || s1 === undefined || tN === undefined || tP === undefined) return;
    const fs = mountSideOf(fromBox, s0);
    const ts = mountSideOf(toBox, tN);
    if (fs === null || ts === null) return;
    const [fnx, fny] = sideNormal(fs);
    if ((s1.x - s0.x) * fnx + (s1.y - s0.y) * fny <= 0) return; // doesn't leave the box outward
    const [tnx, tny] = sideNormal(ts);
    if ((tP.x - tN.x) * tnx + (tP.y - tN.y) * tny <= 0) return; // arrives sliding along the border
    const key = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(";");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      path: pts,
      hits: routeHits(pts, obstacles),
      len: routeLength(pts),
      bends: pts.length,
    });
  };
  for (const s of sideMounts(fromBox)) {
    for (const t of sideMounts(toBox)) {
      if (s === undefined || t === undefined) continue;
      add([s, point(s.x, t.y), t]);
      add([s, point(t.x, s.y), t]);
      const ySpan = Math.max(Math.abs(t.y - s.y), 1);
      const yLo = Math.min(s.y, t.y);
      for (let k = 0; k <= OBSTACLE_SCAN_STEPS; k++) {
        const m = yLo - ySpan + k * ((3 * ySpan) / OBSTACLE_SCAN_STEPS);
        add([s, point(s.x, m), point(t.x, m), t]);
      }
      const xSpan = Math.max(Math.abs(t.x - s.x), 1);
      const xLo = Math.min(s.x, t.x);
      for (let k = 0; k <= OBSTACLE_SCAN_STEPS; k++) {
        const m = xLo - xSpan + k * ((3 * xSpan) / OBSTACLE_SCAN_STEPS);
        add([s, point(m, s.y), point(m, t.y), t]);
      }
    }
  }
  return out;
};

const WALL_T = 2; // thickness of a group-border "wall" laid along a side an edge must not tunnel through

// Thin obstacle boxes along the sides of every group the edge ENTERS (a container holding exactly one
// endpoint) that do NOT face the edge's other end — so a rerouted connector enters the group through a
// side facing its source instead of diving around and tunnelling in through the back or the bottom.
// Soft guidance, not a wall in the hard sense: the walls join only the maze's obstacle list, and when
// no walled route exists the maze fails and the edge keeps its current path.
export const enteredContainerWalls = (scene: Scene, edge: SceneEdge): RouteBox[] => {
  const nodeById = new Map<string, SceneNode>(scene.nodes.map((n) => [n.id, n]));
  const ancestorsOf = (id: string): ReadonlySet<string> => {
    const out = new Set<string>();
    let cur = nodeById.get(id)?.parent ?? null;
    for (let depth = 0; cur !== null && depth < MAX_NEST_DEPTH; depth++) {
      out.add(cur);
      cur = nodeById.get(cur)?.parent ?? null;
    }
    return out;
  };
  const fromAnc = ancestorsOf(edge.from);
  const toAnc = ancestorsOf(edge.to);
  const centerOf = (id: string): Point | null => {
    const n = nodeById.get(id);
    if (n === undefined) return null;
    return point(
      n.bounds.origin.x + n.bounds.size.width / 2,
      n.bounds.origin.y + n.bounds.size.height / 2,
    );
  };
  const walls: RouteBox[] = [];
  const addWalls = (containerId: string, other: Point): void => {
    const container = nodeById.get(containerId);
    if (container === undefined) return;
    const g = routeBoxOf(container);
    const openL = other.x < g.x;
    const openR = other.x > g.x + g.w;
    const openT = other.y < g.y;
    const openB = other.y > g.y + g.h;
    // The other endpoint overlaps the group's span in both axes — no side clearly faces it, so leave
    // the group unwalled rather than sealing every entry.
    if (!openL && !openR && !openT && !openB) return;
    if (!openT) walls.push({ x: g.x, y: g.y - WALL_T / 2, w: g.w, h: WALL_T });
    if (!openB) walls.push({ x: g.x, y: g.y + g.h - WALL_T / 2, w: g.w, h: WALL_T });
    if (!openL) walls.push({ x: g.x - WALL_T / 2, y: g.y, w: WALL_T, h: g.h });
    if (!openR) walls.push({ x: g.x + g.w - WALL_T / 2, y: g.y, w: WALL_T, h: g.h });
  };
  for (const id of fromAnc) {
    if (toAnc.has(id) || id === edge.to) continue;
    const other = centerOf(edge.to);
    if (other !== null) addWalls(id, other);
  }
  for (const id of toAnc) {
    if (fromAnc.has(id) || id === edge.from) continue;
    const other = centerOf(edge.from);
    if (other !== null) addWalls(id, other);
  }
  return walls;
};

// Reroute box-family (block/network/cloud/c4) edges that CROSS a node or HUG a border, choosing the
// mount pair + orthogonal detour (via the maze router, which stands off every obstacle by
// OBSTACLE_CLEARANCE so its routes neither cross nor hug) that is strictly cleaner than the current
// path. Entered groups contribute border walls on their non-facing sides (above), so the detour enters
// a group through the side facing the other end. Clean edges — and any the maze can't improve — are
// left exactly as the trunk/spread router laid them, so the backbone aesthetic survives everywhere it
// already reads well.
export const rerouteBoxEdges = (scene: Scene): Scene => {
  const boxes: ScoreBox[] = scene.nodes.flatMap((n) => {
    const body = { id: n.id, box: routeBoxOf(n), container: n.shape === "container" };
    if (n.shape !== "container") return [body];
    return [
      body,
      { id: `${n.id}:hdr`, box: containerHeaderBox(routeBoxOf(n), n.label), container: true },
    ];
  });
  const boxById = new Map<string, RouteBox>(scene.nodes.map((n) => [n.id, routeBoxOf(n)]));
  const obstacleBoxes = obstaclesForEdges(scene);
  const edges = scene.edges.map((e): SceneEdge => {
    const start = e.waypoints[0];
    const end = e.waypoints[e.waypoints.length - 1];
    if (start === undefined || end === undefined || e.from === e.to) return e;
    const obstacles = obstacleBoxes.get(e.id) ?? [];
    const curBad = routeBadness(e.waypoints, boxes, e.from, e.to);
    if (curBad === 0) return e; // already clean
    const fromBox = boxById.get(e.from);
    const toBox = boxById.get(e.to);
    const walledObstacles = [...obstacles, ...enteredContainerWalls(scene, e)];
    // Two candidate sources: the maze (arbitrary detours) and the orthodox L/Z patterns (staircase
    // alternatives the maze's per-pair length optimum skips). Pick by fewest obstacle/wall hits, then
    // the least on-screen badness, then the shortest — so the accepted route both respects the group
    // walls and arrives clean rather than sliding along a border.
    const pool = [
      ...mazePathCandidates(fromBox ?? null, toBox ?? null, start, end, walledObstacles),
      ...(fromBox !== undefined && toBox !== undefined
        ? patternCandidates(fromBox, toBox, walledObstacles)
        : []),
    ];
    let maze: readonly Point[] | null = null;
    let bestHits = Number.POSITIVE_INFINITY;
    let newBad = Number.POSITIVE_INFINITY;
    let bestLen = Number.POSITIVE_INFINITY;
    for (const c of pool) {
      const bad = routeBadness(c.path, boxes, e.from, e.to);
      if (
        c.hits < bestHits ||
        (c.hits === bestHits && (bad < newBad || (bad === newBad && c.len < bestLen)))
      ) {
        maze = c.path;
        bestHits = c.hits;
        newBad = bad;
        bestLen = c.len;
      }
    }
    if (maze === null || maze.length < 2) return e;
    if (newBad >= curBad) return e; // not strictly cleaner on screen — keep the original
    const [w0, w1, ...wr] = maze;
    if (w0 === undefined || w1 === undefined) return e;
    const waypoints = twoOrMore(w0, w1, ...wr);
    return { ...e, waypoints, labelPos: e.labelPos === null ? null : pathMidpoint(waypoints) };
  });
  return { ...scene, edges };
};
