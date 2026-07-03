import type {
  EdgeStyles,
  LayoutOverrides,
  NodeStyles,
  Scene,
  SceneEdge,
  SceneNode,
  SceneNodeId,
} from "@m/contracts";
import { point, rect, twoOrMore, type Point, type Size } from "@m/std";
import { edgeLabelAnchorAt } from "@m/renderer";

// Apply the presentation-only overlay (curved edges, coloured nodes) to a laid-out scene — display only,
// like `applyOverrides`. Kept separate so it composes after geometry without changing that signature.
import {
  mazeAroundObstacles,
  obstaclesForEdges,
  routeBoxOf,
  pathMidpoint,
  type RouteBox,
  snapSceneEdgesToMountPoints,
} from "@m/layout";

export const applyStyles = (
  scene: Scene,
  edgeStyles: EdgeStyles,
  nodeStyles: NodeStyles,
  snapToMountPoints = false,
): Scene => {
  if (edgeStyles.size === 0 && nodeStyles.size === 0) {
    return snapToMountPoints ? snapSceneEdgesToMountPoints(scene) : scene;
  }

  let obstacleBoxes: Map<string, readonly RouteBox[]> | null = null;
  let boxById: Map<string, RouteBox> | null = null;

  const getObstacles = () => {
    if (obstacleBoxes === null) {
      obstacleBoxes = obstaclesForEdges(scene);
    }
    return obstacleBoxes;
  };

  const getBoxById = () => {
    if (boxById === null) {
      boxById = new Map<string, RouteBox>(scene.nodes.map((n) => [n.id, routeBoxOf(n)]));
    }
    return boxById;
  };

  const edges =
    edgeStyles.size === 0
      ? scene.edges
      : scene.edges.map((e): SceneEdge => {
          const s = edgeStyles.get(e.id);
          if (s === undefined) return e;
          const labelPos = (points: readonly Point[]): Point | null => {
            if (e.label === null) return null;
            if (s.labelT === null) return e.labelPos;
            const anchor = edgeLabelAnchorAt(points, s.labelT);
            return point(anchor.x, anchor.y);
          };
          // Manual control points win over auto-routing: keep the endpoints attached to the current
          // node mounts (first/last laid-out waypoint) and thread the user's interior bends between them.
          if (s.waypoints !== null && s.waypoints.length > 0) {
            const start = e.waypoints[0];
            const end = e.waypoints[e.waypoints.length - 1];
            if (start !== undefined && end !== undefined) {
              const pts = [start, ...s.waypoints, end];
              const [w0, w1, ...wr] = pts;
              if (w0 !== undefined && w1 !== undefined) {
                const routed = twoOrMore(w0, w1, ...wr);
                return {
                  ...e,
                  curved: s.route === "curved",
                  waypoints: routed,
                  labelPos: labelPos(routed),
                };
              }
            }
          }
          // `straight` collapses the route to a direct endpoint→endpoint line; `curved` flags the
          // rounded-corner render; `square` keeps the laid-out right-angle route. The label follows.
          if (s.route === "straight") {
            const a = e.waypoints[0];
            const b = e.waypoints[e.waypoints.length - 1];
            if (a === undefined || b === undefined) return { ...e, curved: false };
            return {
              ...e,
              curved: false,
              waypoints: twoOrMore(a, b),
              labelPos:
                s.labelT === null && e.labelPos !== null
                  ? point((a.x + b.x) / 2, (a.y + b.y) / 2)
                  : labelPos(twoOrMore(a, b)),
            };
          }

          const routeOption = s.routeOption;
          if (routeOption !== null) {
            const obstacles = getObstacles().get(e.id) ?? [];
            const start = e.waypoints[0];
            const end = e.waypoints[e.waypoints.length - 1];
            if (start !== undefined && end !== undefined && e.from !== e.to) {
              const path = mazeAroundObstacles(
                getBoxById().get(e.from) ?? null,
                getBoxById().get(e.to) ?? null,
                start,
                end,
                e.waypoints,
                obstacles,
                routeOption,
              );
              if (path !== null) {
                const [w0, w1, ...wr] = path;
                if (w0 !== undefined && w1 !== undefined) {
                  return {
                    ...e,
                    curved: s.route === "curved",
                    waypoints: twoOrMore(w0, w1, ...wr),
                    labelPos:
                      s.labelT === null
                        ? e.labelPos === null
                          ? null
                          : pathMidpoint(path)
                        : labelPos(path),
                  };
                }
              }
            }
          }

          const curved = s.route === "curved";
          const movedLabel = labelPos(e.waypoints);
          return curved !== e.curved || movedLabel !== e.labelPos
            ? { ...e, curved, labelPos: movedLabel }
            : e;
        });
  const nodes =
    nodeStyles.size === 0
      ? scene.nodes
      : scene.nodes.map((n): SceneNode => {
          const s = nodeStyles.get(n.id);
          return s !== undefined && s.accent !== n.accent ? { ...n, accent: s.accent } : n;
        });
  const styled = { ...scene, nodes, edges };
  const snapped = snapToMountPoints ? snapSceneEdgesToMountPoints(styled) : styled;
  if (!snapToMountPoints || edgeStyles.size === 0) return snapped;
  const relabelled = snapped.edges.map((e): SceneEdge => {
    const s = edgeStyles.get(e.id);
    if (s === undefined || s.labelT === null || e.label === null) return e;
    const anchor = edgeLabelAnchorAt(e.waypoints, s.labelT);
    return { ...e, labelPos: point(anchor.x, anchor.y) };
  });
  return { ...snapped, edges: relabelled };
};

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
export const applyOverrides = (
  scene: Scene,
  overrides: LayoutOverrides,
  snapToMountPoints = false,
): Scene => {
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
      // The label rides along too (it was detaching, left at the pre-drag spot, before this).
      return {
        ...edge,
        waypoints: twoOrMore(shift(w0), shift(w1), ...wr.map(shift)),
        labelPos: edge.labelPos === null ? null : shift(edge.labelPos),
      };
    }
    // One endpoint moved (or the two by different deltas): translate each waypoint by a blend of the
    // endpoints' deltas weighted by its position along the edge (0 at `from`, 1 at `to`). Endpoints land
    // on the moved node's new border (it moved rigidly), and the in-between shape is preserved — so a
    // sequence message dragged by one actor keeps its row instead of collapsing onto the actor-header.
    const fromD = from ?? { dx: 0, dy: 0 };
    const toD = to ?? { dx: 0, dy: 0 };
    const last = edge.waypoints.length - 1;
    const blendAt = (p: Point, t: number): Point =>
      point(p.x + fromD.dx * (1 - t) + toD.dx * t, p.y + fromD.dy * (1 - t) + toD.dy * t);
    const blend = (p: Point, i: number): Point => blendAt(p, last <= 0 ? 0 : i / last);
    const [w0, w1, ...wr] = edge.waypoints;
    return {
      ...edge,
      waypoints: twoOrMore(blend(w0, 0), blend(w1, 1), ...wr.map((p, i) => blend(p, i + 2))),
      // Blend the mid-edge label at t≈0.5 so it tracks the connector rather than staying put.
      labelPos: edge.labelPos === null ? null : blendAt(edge.labelPos, 0.5),
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
  const moved = { ...scene, nodes, edges, extent };
  return snapToMountPoints ? snapSceneEdgesToMountPoints(moved) : moved;
};
