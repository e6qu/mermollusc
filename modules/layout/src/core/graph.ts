export interface LayoutNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}
export interface LayoutEdge {
  readonly id: string;
  readonly sources: readonly string[];
  readonly targets: readonly string[];
}
export interface LayoutGraph {
  readonly id: string;
  readonly layoutOptions: Readonly<Record<string, string>>;
  readonly children: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[];
}

export interface PositionedNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface PositionedEdge {
  readonly id: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
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
