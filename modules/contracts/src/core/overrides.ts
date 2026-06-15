// Sidecar manual-geometry layer. Lives outside the Mermaid text (which has no coordinates);
// keyed by scene node. `pinned` nodes stay put on regenerate; all overrides seed a relax.

import type { Point, Size } from "@m/std";
import type { SceneNodeId } from "./scene.js";

export interface NodeOverride {
  readonly position: Point;
  readonly size: Size | null;
  readonly pinned: boolean;
}

export type LayoutOverrides = ReadonlyMap<SceneNodeId, NodeOverride>;
