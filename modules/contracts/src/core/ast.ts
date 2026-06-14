// AST contract: the parser's output and the layout's input.

import type { Brand } from "@m/std";

export type NodeId = Brand<string, "NodeId">;
export type EdgeId = Brand<string, "EdgeId">;

export type NodeShape = "rect" | "round" | "stadium" | "diamond" | "circle";
export type EdgeKind = "arrow" | "open" | "dotted" | "thick";
export type FlowDirection = "TB" | "BT" | "LR" | "RL";

export interface FlowNode {
  readonly id: NodeId;
  readonly label: string;
  readonly shape: NodeShape;
}

export interface FlowEdge {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly kind: EdgeKind;
  readonly label: string | null;
}

export interface FlowchartAst {
  readonly kind: "flowchart";
  readonly direction: FlowDirection;
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
}

// Grows one variant per family (sequence, c4, block/network, ...). The `kind` tag discriminates.
export type DiagramAst = FlowchartAst;
