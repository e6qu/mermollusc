import { point, twoOrMore, type Point, type TwoOrMore } from "@m/std";
import type { Scene, SceneEdge } from "@m/contracts";

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
    // mid points sit on the central cross-channel leg.
    const horizontal = fs === "L" || fs === "R";
    const m1 = horizontal ? point((p0.x + p3.x) / 2, p0.y) : point(p0.x, (p0.y + p3.y) / 2);
    const m2 = horizontal ? point((p0.x + p3.x) / 2, p3.y) : point(p3.x, (p0.y + p3.y) / 2);
    // A label anchored on the channel leg follows the new route (its old anchor is now stale).
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
