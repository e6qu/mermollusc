// AST contract: the parser's output and the layout's input.

import type { Brand } from "@m/std";

export type NodeId = Brand<string, "NodeId">;
export type EdgeId = Brand<string, "EdgeId">;

export type NodeShape = "rect" | "round" | "stadium" | "diamond" | "circle" | "container";
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

export interface BlockNode {
  readonly id: NodeId;
  readonly label: string;
  readonly shape: NodeShape;
}

export interface BlockEdge {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly kind: EdgeKind;
  readonly label: string | null;
}

// A `block-beta` diagram: blocks flow into a `columns`-wide grid; edges connect them.
export interface BlockAst {
  readonly kind: "block";
  readonly columns: number;
  readonly blocks: readonly BlockNode[];
  readonly edges: readonly BlockEdge[];
}

export type NetworkNodeKind =
  | "server"
  | "database"
  | "cloud"
  | "router"
  | "switch"
  | "firewall"
  | "host";

export interface NetworkNode {
  readonly id: NodeId;
  readonly label: string;
  readonly kind: NetworkNodeKind;
}

export interface NetworkLink {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  // Undirected connection; null when the link carries no label.
  readonly label: string | null;
}

// A network diagram: kind-typed nodes joined by undirected links.
export interface NetworkAst {
  readonly kind: "network";
  readonly nodes: readonly NetworkNode[];
  readonly links: readonly NetworkLink[];
}

// Grows one variant per family (cloud, ...). The `kind` tag discriminates.
export type DiagramAst = FlowchartAst | SequenceAst | C4Ast | BlockAst | NetworkAst;
