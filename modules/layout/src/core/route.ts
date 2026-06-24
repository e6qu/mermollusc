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
