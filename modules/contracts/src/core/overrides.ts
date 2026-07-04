// Sidecar manual-geometry layer. Lives outside the Mermaid text (which has no coordinates);
// keyed by scene node. `pinned` nodes stay put on regenerate; all overrides seed a relax.

import type { Point, Size } from "@m/std";
import type { NodeAccent, SceneEdgeId, SceneNodeId } from "./scene.js";

export interface NodeOverride {
  readonly position: Point;
  readonly size: Size | null;
  readonly pinned: boolean;
}

export type LayoutOverrides = ReadonlyMap<SceneNodeId, NodeOverride>;

// Presentation-only overlay layers — visual preferences (a curved connector, a coloured node) that have
// no Mermaid syntax, so they live in the sidecar overlay alongside positions and travel with it (persist,
// share-link, collab), keeping the diagram text vanilla Mermaid. Keyed by scene id like the geometry.
// How a connector is drawn between its endpoints: `square` = the laid-out right-angle route; `straight`
// = a direct line; `curved` = the right-angle route with rounded corners (the bend, not the whole path).
export type EdgeRoute = "square" | "straight" | "curved";
export interface EdgeStyle {
  readonly route: EdgeRoute;
  readonly routeOption: number | null;
  readonly labelT: number | null;
  // Manual control points (Miro-style bend handles): the INTERIOR waypoints the user placed, in absolute
  // scene coordinates. `null` means auto-routed. When present they define the path — the endpoints still
  // attach to the current node mounts (so moving a node keeps the connection), and `route` decides how
  // the segments between the points render (straight legs, or `curved` smooths them).
  readonly waypoints: readonly Point[] | null;
  // The connector's colour, as a semantic accent (resolved to a stroke colour by the renderer); `null`
  // keeps the default edge colour. Mirrors a node's `accent`.
  readonly accent: NodeAccent | null;
}
export interface NodeStyle {
  readonly accent: NodeAccent;
}
export type EdgeStyles = ReadonlyMap<SceneEdgeId, EdgeStyle>;
export type NodeStyles = ReadonlyMap<SceneNodeId, NodeStyle>;
