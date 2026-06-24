import type { LayoutOverrides, Scene, SceneEdge, SceneNode, SceneNodeId } from "@m/contracts";
import { point, rect, twoOrMore, type Point, type Size } from "@m/std";

export const moveNode = (
  overrides: LayoutOverrides,
  id: SceneNodeId,
  position: Point,
): LayoutOverrides => {
  const next = new Map(overrides);
  next.set(id, { position, size: overrides.get(id)?.size ?? null, pinned: true });
  return next;
};

// Pin a node to an explicit box (position + size) — the resize counterpart to `moveNode`, which
// only sets position. Resizing from a corner moves the origin too, so both are set together.
export const resizeNode = (
  overrides: LayoutOverrides,
  id: SceneNodeId,
  position: Point,
  size: Size,
): LayoutOverrides => {
  const next = new Map(overrides);
  next.set(id, { position, size, pinned: true });
  return next;
};

export const clearOverride = (overrides: LayoutOverrides, id: SceneNodeId): LayoutOverrides => {
  if (!overrides.has(id)) return overrides;
  const next = new Map(overrides);
  next.delete(id);
  return next;
};

// Repositions overridden node boxes and keeps their connectors attached without a re-layout: an edge
// whose endpoints both moved by the *same* delta (a group dragged as one) has its whole route
// translated; an edge crossing the moved set (one endpoint moved, or by a different delta) has each
// waypoint translated by a position-weighted blend of the two endpoints' deltas, so it stays attached
// to both borders while preserving its shape (and a sequence message its row).
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

  const edges = scene.edges.map((edge): SceneEdge => {
    const from = delta.get(edge.from);
    const to = delta.get(edge.to);
    if (from === undefined && to === undefined) return edge;
    if (from !== undefined && to !== undefined && from.dx === to.dx && from.dy === to.dy) {
      const shift = (p: Point): Point => point(p.x + from.dx, p.y + from.dy);
      const [w0, w1, ...wr] = edge.waypoints;
      return { ...edge, waypoints: twoOrMore(shift(w0), shift(w1), ...wr.map(shift)) };
    }
    // One endpoint moved (or the two by different deltas): translate each waypoint by a blend of the
    // endpoints' deltas weighted by its position along the edge (0 at `from`, 1 at `to`). Endpoints land
    // on the moved node's new border (it moved rigidly), and the in-between shape is preserved — so a
    // sequence message dragged by one actor keeps its row instead of collapsing onto the actor-header.
    const fromD = from ?? { dx: 0, dy: 0 };
    const toD = to ?? { dx: 0, dy: 0 };
    const last = edge.waypoints.length - 1;
    const blend = (p: Point, i: number): Point => {
      const t = last <= 0 ? 0 : i / last;
      return point(p.x + fromD.dx * (1 - t) + toD.dx * t, p.y + fromD.dy * (1 - t) + toD.dy * t);
    };
    const [w0, w1, ...wr] = edge.waypoints;
    return {
      ...edge,
      waypoints: twoOrMore(blend(w0, 0), blend(w1, 1), ...wr.map((p, i) => blend(p, i + 2))),
    };
  });

  // Grow the extent to the true bounds of the overridden scene. A node dragged left/up past the
  // layout's origin has negative coordinates, so the extent origin must move too (not just width/
  // height) — otherwise the host, which anchors the canvas at the extent origin, clips it off the
  // top-left. Edge waypoints are included so a translated (group-dragged) connector isn't clipped
  // either. The host offsets paint + pointer-mapping by this origin, so a zero origin (the common
  // case, no negative drag) is unchanged.
  let minX: number = scene.extent.origin.x;
  let minY: number = scene.extent.origin.y;
  let maxX: number = scene.extent.origin.x + scene.extent.size.width;
  let maxY: number = scene.extent.origin.y + scene.extent.size.height;
  for (const node of nodes) {
    minX = Math.min(minX, node.bounds.origin.x);
    minY = Math.min(minY, node.bounds.origin.y);
    maxX = Math.max(maxX, node.bounds.origin.x + node.bounds.size.width);
    maxY = Math.max(maxY, node.bounds.origin.y + node.bounds.size.height);
  }
  for (const edge of edges) {
    for (const p of edge.waypoints) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const extent = rect(minX, minY, maxX - minX, maxY - minY);
  return { ...scene, nodes, edges, extent };
};
