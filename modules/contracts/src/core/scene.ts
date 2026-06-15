// SceneGraph IR contract: the layout's output and the renderer's input.

import type { Brand, Point, Rect } from "@m/std";
import type { NodeShape } from "./ast.js";

export type SceneNodeId = Brand<string, "SceneNodeId">;
export type SceneEdgeId = Brand<string, "SceneEdgeId">;

export type EdgeStroke = "solid" | "dashed";
export type EdgeArrow = "none" | "filled";

export interface SceneNode {
  readonly id: SceneNodeId;
  readonly bounds: Rect;
  readonly label: string;
  readonly shape: NodeShape;
  readonly parent: SceneNodeId | null;
}

export interface SceneEdge {
  readonly id: SceneEdgeId;
  readonly from: SceneNodeId;
  readonly to: SceneNodeId;
  readonly waypoints: readonly Point[];
  readonly label: string | null;
  readonly stroke: EdgeStroke;
  readonly arrow: EdgeArrow;
}

export interface Scene {
  readonly nodes: readonly SceneNode[];
  readonly edges: readonly SceneEdge[];
  readonly extent: Rect;
}
