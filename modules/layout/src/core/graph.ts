export interface LayoutConfig {
  readonly direction: "DOWN" | "UP" | "RIGHT" | "LEFT";
  readonly interactive: boolean;
  readonly nodeSpacing: number;
  readonly layerSpacing: number;
}

export interface LayoutNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly position: { readonly x: number; readonly y: number } | null;
}
export interface LayoutEdge {
  readonly id: string;
  readonly sources: readonly string[];
  readonly targets: readonly string[];
}
export interface LayoutGraph {
  readonly id: string;
  readonly config: LayoutConfig;
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

// Measures a label's rendered text width in px. Injected so the shell can use a real canvas
// `measureText`; the default reproduces the long-standing char-width heuristic, keeping pure
// layouts deterministic (and their tests stable) when no measurer is supplied.
export type MeasureText = (label: string) => number;

const CHAR_WIDTH = 8;
export const heuristicMeasure: MeasureText = (label) => label.length * CHAR_WIDTH;
