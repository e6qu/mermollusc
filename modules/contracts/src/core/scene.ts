// SceneGraph IR contract: the layout's output and the renderer's input.

import type { Brand, Point, Rect } from "@m/std";

export type SceneNodeId = Brand<string, "SceneNodeId">;
export type SceneEdgeId = Brand<string, "SceneEdgeId">;

export interface SceneNode {
  readonly id: SceneNodeId;
  readonly bounds: Rect;
  readonly label: string;
  readonly parent: SceneNodeId | null;
}

export interface SceneEdge {
  readonly id: SceneEdgeId;
  readonly from: SceneNodeId;
  readonly to: SceneNodeId;
  readonly waypoints: readonly Point[];
  readonly label: string | null;
}

export interface Scene {
  readonly nodes: readonly SceneNode[];
  readonly edges: readonly SceneEdge[];
  readonly extent: Rect;
}
