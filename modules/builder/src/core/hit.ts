import { rectContains } from "@m/std";
import type { Point } from "@m/std";
import type { Scene, SceneEdgeId, SceneNodeId } from "@m/contracts";

export type HitTarget =
  | { readonly kind: "node"; readonly id: SceneNodeId }
  | { readonly kind: "edge"; readonly id: SceneEdgeId };

const EDGE_TOLERANCE = 6;

const distanceToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const raw = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, raw));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

// Nodes sit above edges; later nodes sit above earlier ones, so scan back to front.
export const hitTest = (scene: Scene, at: Point): HitTarget | null => {
  for (let i = scene.nodes.length - 1; i >= 0; i--) {
    const node = scene.nodes[i];
    if (node !== undefined && rectContains(node.bounds, at)) return { kind: "node", id: node.id };
  }
  for (const edge of scene.edges) {
    for (let i = 0; i + 1 < edge.waypoints.length; i++) {
      const a = edge.waypoints[i];
      const b = edge.waypoints[i + 1];
      if (a !== undefined && b !== undefined && distanceToSegment(at, a, b) <= EDGE_TOLERANCE) {
        return { kind: "edge", id: edge.id };
      }
    }
  }
  return null;
};
