import type { EdgeId, NodeId } from "@m/contracts";

export interface LayoutConfig {
  readonly direction: "DOWN" | "UP" | "RIGHT" | "LEFT";
  readonly interactive: boolean;
  readonly nodeSpacing: number;
  readonly layerSpacing: number;
}

export interface XY {
  readonly x: number;
  readonly y: number;
}

// A leaf carries its own size (and an optional seed position for relax); a container carries only
// its children and is sized by ELK. Modelling them as a union makes "a leaf with children" or "a
// sized container" unrepresentable, so the layout code needn't guard against them.
export interface LeafNode {
  readonly kind: "leaf";
  readonly id: NodeId;
  readonly width: number;
  readonly height: number;
  readonly position: XY | null;
}
export interface ContainerNode {
  readonly kind: "container";
  readonly id: NodeId;
  readonly children: readonly LayoutNode[];
}
export type LayoutNode = LeafNode | ContainerNode;
export interface LayoutEdge {
  readonly id: EdgeId;
  readonly sources: readonly NodeId[];
  readonly targets: readonly NodeId[];
  // Measured size of the edge's midpoint label, so the router (ELK) can reserve space for it; null when
  // the edge has no label.
  readonly label: { readonly width: number; readonly height: number } | null;
}
export interface LayoutGraph {
  readonly id: string;
  readonly config: LayoutConfig;
  readonly children: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[];
}

export interface PositionedNode {
  readonly id: NodeId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  // The enclosing subgraph container id, or null at the top level. Coordinates are absolute.
  readonly parent: NodeId | null;
}
export interface PositionedEdge {
  readonly id: EdgeId;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  // The centre the router placed the midpoint label at (absolute coords), or null if the edge has no
  // label / the router didn't position one.
  readonly labelPos: XY | null;
}
export interface PositionedGraph {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PositionedNode[];
  readonly edges: readonly PositionedEdge[];
}

export interface LayoutError {
  readonly kind: "layout";
  readonly message: string;
}

// Every layout/routing style any family accepts — a closed union so an unrecognized persisted value is
// rejected at the boundary instead of silently behaving as "all style flags off". "classic" is the
// default everywhere: the closest match to real Mermaid output. The house styles (tidy/organic/bus/
// trunk/relaxed/pills/…) are opt-in.
export type LayoutStyle =
  | "classic"
  | "tidy"
  | "organic"
  | "bus"
  | "trunk"
  | "relaxed"
  | "radial"
  | "columns"
  | "pills"
  | "donut";

// Measures a label's rendered text width in px. Injected so the shell can use a real canvas
// `measureText`; the default reproduces the long-standing char-width heuristic, keeping pure
// layouts deterministic (and their tests stable) when no measurer is supplied.
export type MeasureText = (label: string) => number;

const CHAR_WIDTH = 8;
export const heuristicMeasure: MeasureText = (label) => label.length * CHAR_WIDTH;
