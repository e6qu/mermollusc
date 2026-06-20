import { point, twoOrMore, type Point, type TwoOrMore } from "@m/std";

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
