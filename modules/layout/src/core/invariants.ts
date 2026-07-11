import type { Point, Rect } from "@m/std";
import type { Scene, SceneEdgeId, SceneNodeId } from "@m/contracts";
import { containerHeaderBox, routeBoxOf } from "./route.js";
import type { RouteBox } from "./route.js";
import { segmentThroughBox } from "./maze.js";

// Style invariants a laid-out scene must keep — the mechanical guard behind "energy-aware layout must not
// break a diagram type's expected style." These are pure predicates: the candidate-and-select step keeps
// only candidates that pass, and the test suite asserts them across the golden fixtures so today's styles
// are the locked-in baseline. This module holds the FAMILY-AGNOSTIC ones (computable from any Scene);
// family-specific invariants (sequence actors on one row, gantt bars on the day axis, …) are checked with
// family context where the candidate-select runs, since the generic Scene doesn't carry that semantics.

const overlapArea = (a: Rect, b: Rect): number => {
  const ox =
    Math.min(a.origin.x + a.size.width, b.origin.x + b.size.width) -
    Math.max(a.origin.x, b.origin.x);
  const oy =
    Math.min(a.origin.y + a.size.height, b.origin.y + b.size.height) -
    Math.max(a.origin.y, b.origin.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
};

// A small slack so sub-pixel touching borders (a node sitting flush against a sibling) doesn't count.
const OVERLAP_SLACK = 1;

// No two *sibling* nodes overlap. Nesting (a node inside its container parent) is intentional and skipped;
// containers themselves are siblings only of other top-level nodes, so they're checked against those.
export const noSiblingOverlaps = (scene: Scene): boolean => {
  const nodes = scene.nodes;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (a === undefined || b === undefined) continue;
      if (a.parent === b.id || b.parent === a.id || a.parent !== b.parent) continue;
      if (overlapArea(a.bounds, b.bounds) > OVERLAP_SLACK) return false;
    }
  }
  return true;
};

// Every nested node sits (mostly) inside its container parent — the container families' core invariant.
export const containersEncloseMembers = (scene: Scene): boolean => {
  const boxOf = new Map(scene.nodes.map((n) => [n.id, n.bounds]));
  for (const n of scene.nodes) {
    if (n.parent === null) continue;
    const parent = boxOf.get(n.parent);
    if (parent === undefined) continue;
    // The node's box must lie within the parent's (a tiny slack for borders); a member spilling out of
    // its boundary is a broken container layout.
    const inside =
      n.bounds.origin.x >= parent.origin.x - OVERLAP_SLACK &&
      n.bounds.origin.y >= parent.origin.y - OVERLAP_SLACK &&
      n.bounds.origin.x + n.bounds.size.width <=
        parent.origin.x + parent.size.width + OVERLAP_SLACK &&
      n.bounds.origin.y + n.bounds.size.height <=
        parent.origin.y + parent.size.height + OVERLAP_SLACK;
    if (!inside) return false;
  }
  return true;
};

export const edgesAvoidContainerHeaders = (scene: Scene): boolean => {
  const headers = scene.nodes
    .filter((n) => n.shape === "container")
    .map((n) => ({ id: n.id, box: containerHeaderBox(routeBoxOf(n), n.label) }));
  if (headers.length === 0) return true;
  for (const edge of scene.edges) {
    for (let i = 1; i < edge.waypoints.length; i++) {
      const a = edge.waypoints[i - 1];
      const b = edge.waypoints[i];
      if (a === undefined || b === undefined) continue;
      for (const header of headers) {
        if (header.id === edge.from || header.id === edge.to) continue;
        if (segmentThroughBox(a, b, header.box)) return false;
      }
    }
  }
  return true;
};

export interface CardinalMountViolation {
  readonly edgeId: SceneEdgeId;
  readonly nodeId: SceneNodeId;
  readonly end: "from" | "to";
  readonly endpoint: Point;
}

const POINT_EPS = 0.5;

// An edge endpoint must attach ON one of the node's four cardinal SIDES, anywhere along that side's span
// (not only the side centre). The side centre is the default, but a fan of incompatible edges leaving one
// node is spread ALONG a side so the edges don't share a stub — a directed and an undirected edge can't
// both leave the exact centre without overlapping. Attaching along the side keeps the clean orthogonal
// look while letting the router honour the "no incompatible shared backbone" rule. Off-side or interior
// endpoints are still violations.
const pointOnNodeSide = (p: Point, b: RouteBox): boolean => {
  const withinX = p.x >= b.x - POINT_EPS && p.x <= b.x + b.w + POINT_EPS;
  const withinY = p.y >= b.y - POINT_EPS && p.y <= b.y + b.h + POINT_EPS;
  const onVerticalSide =
    (Math.abs(p.x - b.x) <= POINT_EPS || Math.abs(p.x - (b.x + b.w)) <= POINT_EPS) && withinY;
  const onHorizontalSide =
    (Math.abs(p.y - b.y) <= POINT_EPS || Math.abs(p.y - (b.y + b.h)) <= POINT_EPS) && withinX;
  return onVerticalSide || onHorizontalSide;
};

export const cardinalMountViolations = (scene: Scene): readonly CardinalMountViolation[] => {
  const boxById = new Map(scene.nodes.map((n) => [n.id, routeBoxOf(n)]));
  const violations: CardinalMountViolation[] = [];
  for (const edge of scene.edges) {
    if (edge.from === edge.to) continue;
    const [first, second, ...rest] = edge.waypoints;
    const last = rest[rest.length - 1] ?? second;
    const fromBox = boxById.get(edge.from);
    const toBox = boxById.get(edge.to);
    if (fromBox === undefined || !pointOnNodeSide(first, fromBox)) {
      violations.push({ edgeId: edge.id, nodeId: edge.from, end: "from", endpoint: first });
    }
    if (toBox === undefined || !pointOnNodeSide(last, toBox)) {
      violations.push({ edgeId: edge.id, nodeId: edge.to, end: "to", endpoint: last });
    }
  }
  return violations;
};

export const edgesUseCardinalMounts = (scene: Scene): boolean =>
  cardinalMountViolations(scene).length === 0;

// The family-agnostic style gate: a candidate layout that fails either is rejected before selection.
export const styleOk = (scene: Scene): boolean =>
  noSiblingOverlaps(scene) && containersEncloseMembers(scene) && edgesAvoidContainerHeaders(scene);
