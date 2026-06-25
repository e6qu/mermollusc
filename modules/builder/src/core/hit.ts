import { rectContains } from "@m/std";
import type { Point } from "@m/std";
import type { Scene, SceneEdgeId, SceneNodeId } from "@m/contracts";

export type HitTarget =
  | { readonly kind: "node"; readonly id: SceneNodeId }
  | { readonly kind: "edge"; readonly id: SceneEdgeId };

const EDGE_TOLERANCE = 9;

const distanceToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const raw = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, raw));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

// Every node nested (transitively) inside `containerId`, via the scene parent hierarchy — the members
// that travel with a container (a flowchart subgraph, a c4 boundary, a composite state) when it's
// dragged as one. Guards against a cyclic parent chain so a malformed scene can't loop forever.
export const descendantsOf = (scene: Scene, containerId: SceneNodeId): SceneNodeId[] => {
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const out: SceneNodeId[] = [];
  for (const node of scene.nodes) {
    const seen = new Set<SceneNodeId>();
    let parent = node.parent;
    while (parent !== null && !seen.has(parent)) {
      if (parent === containerId) {
        out.push(node.id);
        break;
      }
      seen.add(parent);
      parent = byId.get(parent)?.parent ?? null;
    }
  }
  return out;
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
