import type { LayoutOverrides, Scene, SceneEdge, SceneNode, SceneNodeId } from "@m/contracts";
import { point, rect, type Point, type Rect } from "@m/std";

export const moveNode = (
  overrides: LayoutOverrides,
  id: SceneNodeId,
  position: Point,
): LayoutOverrides => {
  const next = new Map(overrides);
  next.set(id, { position, size: overrides.get(id)?.size ?? null, pinned: true });
  return next;
};

export const clearOverride = (overrides: LayoutOverrides, id: SceneNodeId): LayoutOverrides => {
  if (!overrides.has(id)) return overrides;
  const next = new Map(overrides);
  next.delete(id);
  return next;
};

// The point on `from`'s border along the ray toward `to`'s centre — used to re-anchor an edge whose
// endpoint node moved, so the connector meets the box edge instead of dangling at the old spot.
const borderPoint = (from: Rect, to: Rect): Point => {
  const cx = from.origin.x + from.size.width / 2;
  const cy = from.origin.y + from.size.height / 2;
  const dx = to.origin.x + to.size.width / 2 - cx;
  const dy = to.origin.y + to.size.height / 2 - cy;
  if (dx === 0 && dy === 0) return point(cx, cy);
  const sx = dx === 0 ? Number.POSITIVE_INFINITY : from.size.width / 2 / Math.abs(dx);
  const sy = dy === 0 ? Number.POSITIVE_INFINITY : from.size.height / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return point(cx + dx * s, cy + dy * s);
};

// Repositions overridden node boxes and keeps their connectors attached without a re-layout: an edge
// whose endpoints both moved by the *same* delta (a group dragged as one) has its route translated
// so its shape is preserved; an edge crossing the moved set (one endpoint moved, or by a different
// delta) is re-anchored to a straight line between the two boxes' borders.
export const applyOverrides = (scene: Scene, overrides: LayoutOverrides): Scene => {
  if (overrides.size === 0) return scene;
  const delta = new Map<SceneNodeId, { readonly dx: number; readonly dy: number }>();
  const nodes = scene.nodes.map((node): SceneNode => {
    const override = overrides.get(node.id);
    if (override === undefined) return node;
    delta.set(node.id, {
      dx: override.position.x - node.bounds.origin.x,
      dy: override.position.y - node.bounds.origin.y,
    });
    return {
      ...node,
      bounds: { origin: override.position, size: override.size ?? node.bounds.size },
    };
  });
  if (delta.size === 0) return { ...scene, nodes };

  const boundsById = new Map<SceneNodeId, Rect>(nodes.map((n) => [n.id, n.bounds]));
  const edges = scene.edges.map((edge): SceneEdge => {
    const from = delta.get(edge.from);
    const to = delta.get(edge.to);
    if (from === undefined && to === undefined) return edge;
    if (from !== undefined && to !== undefined && from.dx === to.dx && from.dy === to.dy) {
      return { ...edge, waypoints: edge.waypoints.map((p) => point(p.x + from.dx, p.y + from.dy)) };
    }
    const a = boundsById.get(edge.from);
    const b = boundsById.get(edge.to);
    if (a === undefined || b === undefined) return edge;
    return { ...edge, waypoints: [borderPoint(a, b), borderPoint(b, a)] };
  });

  // Grow the extent so a node dragged past the original layout's bounds isn't clipped by the stage.
  // (The layout always emits an origin-anchored extent, so widening width/height suffices.)
  let width: number = scene.extent.size.width;
  let height: number = scene.extent.size.height;
  for (const node of nodes) {
    width = Math.max(width, node.bounds.origin.x + node.bounds.size.width);
    height = Math.max(height, node.bounds.origin.y + node.bounds.size.height);
  }
  const extent = rect(scene.extent.origin.x, scene.extent.origin.y, width, height);
  return { ...scene, nodes, edges, extent };
};
