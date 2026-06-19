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
  // A small, dimmed line drawn *above* the title (a UML class `«interface»` stereotype); null for
  // none. Widens the title band so it doesn't crowd the name or the divider.
  readonly subtitle: string | null;
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

// A filled circular sector (a pie-chart slice). Angles are in canvas convention — radians from the
// +x axis, increasing clockwise (the y-axis points down) — so the painter and SVG backend draw the
// same arc without re-deriving the geometry. `colorIndex` selects a categorical palette colour at the
// shell; `percent` is the slice's share of the whole (0–100) for the on-slice label.
export interface SceneWedge {
  readonly center: Point;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly label: string;
  readonly value: number;
  readonly percent: number;
  readonly colorIndex: number;
}

export interface Scene {
  readonly nodes: readonly SceneNode[];
  readonly edges: readonly SceneEdge[];
  // Filled sectors for radial diagrams (pie charts); empty for every node/edge family.
  readonly wedges: readonly SceneWedge[];
  readonly extent: Rect;
}
