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
export interface EdgeStyle {
  readonly curved: boolean;
}
export interface NodeStyle {
  readonly accent: NodeAccent;
}
export type EdgeStyles = ReadonlyMap<SceneEdgeId, EdgeStyle>;
export type NodeStyles = ReadonlyMap<SceneNodeId, NodeStyle>;
