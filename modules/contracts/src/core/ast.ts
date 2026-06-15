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

export type ActorId = Brand<string, "ActorId">;
export type MessageId = Brand<string, "MessageId">;

// Mermaid sequence arrows: ->> (solid), -->> (dashed), -> (solidOpen), --> (dashedOpen).
export type MessageKind = "solid" | "dashed" | "solidOpen" | "dashedOpen";

export interface SequenceActor {
  readonly id: ActorId;
  readonly label: string;
}

export interface SequenceMessage {
  readonly id: MessageId;
  readonly from: ActorId;
  readonly to: ActorId;
  readonly text: string;
  readonly kind: MessageKind;
}

export interface SequenceAst {
  readonly kind: "sequence";
  readonly actors: readonly SequenceActor[];
  readonly messages: readonly SequenceMessage[];
}

export type C4ElementId = Brand<string, "C4ElementId">;
export type C4RelId = Brand<string, "C4RelId">;
export type C4ElementKind = "person" | "system" | "container" | "boundary";

export interface C4Element {
  readonly id: C4ElementId;
  readonly label: string;
  readonly kind: C4ElementKind;
  readonly parent: C4ElementId | null; // set when nested inside a boundary
}

export interface C4Rel {
  readonly id: C4RelId;
  readonly from: C4ElementId;
  readonly to: C4ElementId;
  readonly label: string;
}

export interface C4Ast {
  readonly kind: "c4";
  readonly elements: readonly C4Element[];
  readonly rels: readonly C4Rel[];
}

// Grows one variant per family (block/network, ...). The `kind` tag discriminates.
export type DiagramAst = FlowchartAst | SequenceAst | C4Ast;
