import { point, twoOrMore, type Point, type TwoOrMore } from "@m/std";
import type { Scene, SceneEdge } from "@m/contracts";
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
export const mazeRerouteEdges = (scene: Scene): Scene => {
  const boxed = scene.nodes
    .filter((n) => n.shape !== "container")
    .map((n) => ({
      id: n.id,
      box: {
        x: n.bounds.origin.x,
        y: n.bounds.origin.y,
        w: n.bounds.size.width,
        h: n.bounds.size.height,
      },
    }));
  const edges = scene.edges.map((e): SceneEdge => {
    const start = e.waypoints[0];
    const end = e.waypoints[e.waypoints.length - 1];
    if (start === undefined || end === undefined || e.from === e.to) return e;
    const obstacles = boxed.filter((b) => b.id !== e.from && b.id !== e.to).map((b) => b.box);
    if (routeHits(e.waypoints, obstacles) === 0) return e;
    const maze = mazeRoute(start, end, obstacles, OBSTACLE_CLEARANCE);
    if (maze !== null && maze.length >= 2 && routeHits(maze, obstacles) === 0) {
      const [w0, w1, ...wr] = maze;
      if (w0 !== undefined && w1 !== undefined) {
        return {
          ...e,
          waypoints: twoOrMore(w0, w1, ...wr),
          labelPos: e.labelPos === null ? null : pathMidpoint(maze),
        };
      }
    }
    return e;
  });
  return { ...scene, edges };
};

// De-collide mid-edge labels on dense diagrams: where two edge labels (each placed at its `labelPos`)
// would overlap, nudge the later one vertically clear of the earlier. Greedy and order-stable — a label
// that fits is left exactly where the router put it, so this is a no-op on sparse diagrams. Only edges
// with a label AND an explicit `labelPos` participate (a null `labelPos` is anchored later by the
// renderer). `measure` is the pure text metric the layout already uses.
const LABEL_HEIGHT = 16;
const LABEL_X_PAD = 8; // horizontal padding folded into a label's measured width
const LABEL_V_GAP = 4; // minimum vertical gap kept between two stacked labels
export const decollideEdgeLabels = (scene: Scene, measure: MeasureText): Scene => {
  interface LabelBox {
    readonly cx: number;
    readonly cy: number;
    readonly halfW: number;
  }
  const placed: LabelBox[] = [];
  const overlaps = (a: LabelBox, b: LabelBox): boolean =>
    Math.abs(a.cx - b.cx) < a.halfW + b.halfW && Math.abs(a.cy - b.cy) < LABEL_HEIGHT + LABEL_V_GAP;
  const edges = scene.edges.map((e): SceneEdge => {
    const anchor = e.labelPos;
    if (e.label === null || anchor === null) return e;
    const halfW = (measure(e.label) + LABEL_X_PAD) / 2;
    let cy: number = anchor.y;
    for (let guard = 0; guard < 64; guard++) {
      const blocker = placed.find((p) => overlaps({ cx: anchor.x, cy, halfW }, p));
      if (blocker === undefined) break;
      cy = blocker.cy + LABEL_HEIGHT + LABEL_V_GAP; // drop just below whatever it hit, then retest
    }
    placed.push({ cx: anchor.x, cy, halfW });
    return cy === anchor.y ? e : { ...e, labelPos: point(anchor.x, cy) };
  });
  return { ...scene, edges };
};

export const spreadPorts = (scene: Scene): Scene => {
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
  // Candidate obstacles: every non-container node box (a container is a region, not an obstacle). Each
  // edge excludes its own two endpoints below.
  const obstacleNodes = scene.nodes.filter((n) => n.shape !== "container");
  const obstacleBoxes = new Map<string, RouteBox[]>(
    scene.edges.map((e) => [
      e.id,
      obstacleNodes
        .filter((n) => n.id !== e.from && n.id !== e.to)
        .map(
          (n): RouteBox => ({
            x: n.bounds.origin.x,
            y: n.bounds.origin.y,
            w: n.bounds.size.width,
            h: n.bounds.size.height,
          }),
        ),
    ]),
  );
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
  return { ...scene, edges };
};

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
