import { point, type Point, type Rect } from "@m/std";
import type { Scene, SceneEdge } from "@m/contracts";

// A pure quality score for a laid-out scene — the "energy" an energy-aware layout would minimise. It is
// MEASUREMENT only (no layout changes): used to compare candidate layouts deterministically and to track
// overlap regressions. Lower is tidier. The weights are tuned against screenshots and kept here as the
// single source of truth; a crossing costs far more than a stray bend.
const W_CROSS = 10; // a pair of edges whose segments visibly cross
const W_EDGE_NODE = 6; // an edge passing through an unrelated node's box
const W_NODE_OVERLAP = 20; // two node boxes overlapping (should be ~0 already)
const W_TIDY = 0.01; // a faint pull toward fewer bends / shorter total length (a tiebreaker only)

export interface EnergyBreakdown {
  readonly crossings: number;
  readonly edgeNodeHits: number;
  readonly nodeOverlaps: number;
  readonly bends: number;
  readonly length: number;
  readonly total: number;
}

const cross = (o: Point, a: Point, b: Point): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

// Do segments p1p2 and p3p4 properly cross (interiors intersect)? Shared endpoints / collinear touches
// don't count — so two edges meeting at a common node aren't scored as a crossing.
const segmentsCross = (p1: Point, p2: Point, p3: Point, p4: Point): boolean => {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

const segmentsOf = (edge: SceneEdge): readonly (readonly [Point, Point])[] => {
  const segs: [Point, Point][] = [];
  for (let i = 1; i < edge.waypoints.length; i++) {
    const a = edge.waypoints[i - 1];
    const b = edge.waypoints[i];
    if (a !== undefined && b !== undefined) segs.push([a, b]);
  }
  return segs;
};

// Whether a segment passes through the interior of a rect (an axis-aligned box): an endpoint inside, or
// the segment crossing one of the four borders. Used to flag an edge cutting through an unrelated node.
const segmentHitsRect = (a: Point, b: Point, r: Rect): boolean => {
  const x0 = r.origin.x;
  const y0 = r.origin.y;
  const x1 = x0 + r.size.width;
  const y1 = y0 + r.size.height;
  const inside = (p: Point): boolean => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1;
  if (inside(a) || inside(b)) return true;
  const c = (px: number, py: number, qx: number, qy: number): boolean =>
    segmentsCross(a, b, point(px, py), point(qx, qy));
  return c(x0, y0, x1, y0) || c(x1, y0, x1, y1) || c(x1, y1, x0, y1) || c(x0, y1, x0, y0);
};

const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.origin.x < b.origin.x + b.size.width &&
  a.origin.x + a.size.width > b.origin.x &&
  a.origin.y < b.origin.y + b.size.height &&
  a.origin.y + a.size.height > b.origin.y;

export const layoutEnergy = (scene: Scene): EnergyBreakdown => {
  const edgeSegs = scene.edges.map(segmentsOf);

  // Edge–edge crossings: every segment of edge i against every segment of edge j>i.
  let crossings = 0;
  for (let i = 0; i < edgeSegs.length; i++) {
    for (let j = i + 1; j < edgeSegs.length; j++) {
      const a = edgeSegs[i];
      const b = edgeSegs[j];
      if (a === undefined || b === undefined) continue;
      for (const [p1, p2] of a) {
        for (const [p3, p4] of b) if (segmentsCross(p1, p2, p3, p4)) crossings++;
      }
    }
  }

  // Edge–node hits: a segment through a node that is NOT one of the edge's own endpoints.
  let edgeNodeHits = 0;
  for (let i = 0; i < scene.edges.length; i++) {
    const edge = scene.edges[i];
    const segs = edgeSegs[i];
    if (edge === undefined || segs === undefined) continue;
    for (const node of scene.nodes) {
      if (node.id === edge.from || node.id === edge.to) continue;
      // A container is a region, not an obstacle: an edge into a member legitimately crosses its box.
      if (node.shape === "container") continue;
      if (segs.some(([a, b]) => segmentHitsRect(a, b, node.bounds))) edgeNodeHits++;
    }
  }

  // Node–node overlaps (a non-container node fully or partly inside another, excluding nesting).
  let nodeOverlaps = 0;
  for (let i = 0; i < scene.nodes.length; i++) {
    for (let j = i + 1; j < scene.nodes.length; j++) {
      const a = scene.nodes[i];
      const b = scene.nodes[j];
      if (a === undefined || b === undefined) continue;
      if (a.parent === b.id || b.parent === a.id) continue; // nesting is intentional, not an overlap
      if (rectsOverlap(a.bounds, b.bounds)) nodeOverlaps++;
    }
  }

  // Tidiness: total length + interior bends (a faint tiebreaker between equally-uncrossed layouts).
  let length = 0;
  let bends = 0;
  for (const segs of edgeSegs) {
    for (const [a, b] of segs) length += Math.hypot(b.x - a.x, b.y - a.y);
    bends += Math.max(0, segs.length - 1);
  }

  const total =
    crossings * W_CROSS +
    edgeNodeHits * W_EDGE_NODE +
    nodeOverlaps * W_NODE_OVERLAP +
    (bends + length) * W_TIDY;
  return { crossings, edgeNodeHits, nodeOverlaps, bends, length, total };
};

// Re-exported for any candidate-selection step: pick the minimum-energy scene, deterministic on ties.
export const lowestEnergy = (scenes: readonly Scene[]): Scene | null => {
  let best: { readonly scene: Scene; readonly e: number } | null = null;
  for (const scene of scenes) {
    const e = layoutEnergy(scene).total;
    if (best === null || e < best.e) best = { scene, e };
  }
  return best === null ? null : best.scene;
};
