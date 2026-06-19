// SceneGraph IR contract: the layout's output and the renderer's input.

import type { Brand, Point, Rect } from "@m/std";
import type { NodeShape } from "./ast.js";

export type SceneNodeId = Brand<string, "SceneNodeId">;
export type SceneEdgeId = Brand<string, "SceneEdgeId">;

export type EdgeStroke = "solid" | "dashed";
// A marker drawn at one end of an edge:
//   - `none` / `arrow` (filled arrowhead, flowchart/state/C4/sequence);
//   - UML class heads: `arrowOpen` (association/dependency V), `triangle` (hollow inheritance/
//     realization head), `diamondFilled` (composition), `diamondHollow` (aggregation);
//   - crow's-foot ER cardinality: `one` = ‖, `zeroOrOne` = ○|, `oneOrMany` = ⪤|, `zeroOrMany` = ⪤○.
export type EdgeEnd =
  | "none"
  | "arrow"
  | "arrowOpen"
  | "triangle"
  | "diamondFilled"
  | "diamondHollow"
  | "one"
  | "zeroOrOne"
  | "oneOrMany"
  | "zeroOrMany";

// A reference into an icon pack (resolved to an SVG at the shell boundary), not the glyph itself —
// keeps the Scene free of asset bytes and the contracts module free of any icon dependency.
export interface IconRef {
  readonly pack: string;
  readonly name: string;
}

export interface SceneNode {
  readonly id: SceneNodeId;
  readonly bounds: Rect;
  readonly label: string;
  readonly shape: NodeShape;
  readonly parent: SceneNodeId | null;
  readonly icon: IconRef | null;
  // Compartment rows under the title (an ER entity's attributes, a class's fields + methods), drawn
  // below a divider; null for an ordinary single-label node.
  readonly rows: readonly string[] | null;
  // Index of the first row below an *extra* inner divider — the field/method split in a UML class
  // box. null draws only the title divider (an ER entity, or a class with one compartment).
  readonly rowDivider: number | null;
}

export interface SceneEdge {
  readonly id: SceneEdgeId;
  readonly from: SceneNodeId;
  readonly to: SceneNodeId;
  readonly waypoints: readonly Point[];
  readonly label: string | null;
  readonly stroke: EdgeStroke;
  readonly fromEnd: EdgeEnd;
  readonly toEnd: EdgeEnd;
}

export interface Scene {
  readonly nodes: readonly SceneNode[];
  readonly edges: readonly SceneEdge[];
  readonly extent: Rect;
}
