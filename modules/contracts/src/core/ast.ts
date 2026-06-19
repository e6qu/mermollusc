// AST contract: the parser's output and the layout's input.

import type { Brand } from "@m/std";
import type { IconRef } from "./scene.js";

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

// A `subgraph id [label] … end` grouping. Membership lives here (`nodes`) rather than on `FlowNode`
// so the node type stays unchanged; nesting is via `parent` (the enclosing subgraph, or null at top
// level). Subgraph ids share the `NodeId` space — an edge may target a subgraph.
export interface FlowSubgraph {
  readonly id: NodeId;
  readonly label: string;
  readonly parent: NodeId | null;
  readonly nodes: readonly NodeId[];
}

export interface FlowchartAst {
  readonly kind: "flowchart";
  readonly direction: FlowDirection;
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
  readonly subgraphs: readonly FlowSubgraph[];
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
  // The optional C4 description (`Person(id, "label", "description")`); null when omitted.
  readonly description: string | null;
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
  // An explicit `icon "<pack>/<name>"` override; null otherwise.
  readonly icon: IconRef | null;
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
  // An explicit `icon "<pack>/<name>"` override; null means use the kind's default glyph.
  readonly icon: IconRef | null;
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

export type CloudNodeKind = "compute" | "storage" | "database" | "queue" | "cdn";

export interface CloudGroup {
  readonly id: NodeId;
  readonly label: string;
  readonly parent: NodeId | null; // enclosing group, or null at the top level
}

export interface CloudNode {
  readonly id: NodeId;
  readonly label: string;
  readonly kind: CloudNodeKind;
  readonly parent: NodeId | null;
  // An explicit `icon "<pack>/<name>"` override; null means use the kind's default glyph.
  readonly icon: IconRef | null;
}

export interface CloudLink {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly label: string | null;
}

// A cloud-architecture diagram: kind-typed service nodes nested inside provider/region groups,
// joined by undirected links. Groups carry synthetic ids (`g0`…) since the syntax names only labels.
export interface CloudAst {
  readonly kind: "cloud";
  readonly groups: readonly CloudGroup[];
  readonly nodes: readonly CloudNode[];
  readonly links: readonly CloudLink[];
}

export type StateId = Brand<string, "StateId">;
export type StateTransitionId = Brand<string, "StateTransitionId">;
// A real state, or one of the `[*]` pseudo-states (initial when a transition's source, final when
// its target). Pseudo-states render as small circles and carry no label.
export type StateKind = "state" | "start" | "end";

export interface StateNode {
  readonly id: StateId;
  readonly label: string;
  readonly kind: StateKind;
}

export interface StateTransition {
  readonly id: StateTransitionId;
  readonly from: StateId;
  readonly to: StateId;
  readonly label: string | null;
}

// A `state X { … }` composite. Mirrors `FlowSubgraph`: direct membership lives in `states`, nesting
// via `parent`. Composite ids share the `StateId` space — a transition may target a composite.
export interface StateComposite {
  readonly id: StateId;
  readonly label: string;
  readonly parent: StateId | null;
  readonly states: readonly StateId[];
}

export interface StateAst {
  readonly kind: "state";
  readonly states: readonly StateNode[];
  readonly transitions: readonly StateTransition[];
  readonly composites: readonly StateComposite[];
}

export type ErEntityId = Brand<string, "ErEntityId">;
export type ErRelId = Brand<string, "ErRelId">;
// Crow's-foot cardinalities (Mermaid `||`/`|o`/`}o`/`}|` etc.), normalised per end.
export type ErCardinality = "one" | "zeroOrOne" | "oneOrMany" | "zeroOrMany";
export type ErKey = "PK" | "FK" | "UK";

export interface ErAttribute {
  readonly type: string;
  readonly name: string;
  readonly keys: readonly ErKey[];
  readonly comment: string;
}

export interface ErEntity {
  readonly id: ErEntityId;
  readonly label: string;
  // Attribute rows from an `ENTITY { type name PK "comment" }` block; empty when none.
  readonly attributes: readonly ErAttribute[];
}

export interface ErRelationship {
  readonly id: ErRelId;
  readonly from: ErEntityId;
  readonly to: ErEntityId;
  readonly fromCard: ErCardinality;
  readonly toCard: ErCardinality;
  readonly identifying: boolean; // `--` solid (identifying) vs `..` dashed (non-identifying)
  readonly label: string;
}

export interface ErAst {
  readonly kind: "er";
  readonly entities: readonly ErEntity[];
  readonly relationships: readonly ErRelationship[];
}

export type ClassEntityId = Brand<string, "ClassEntityId">;
export type ClassRelId = Brand<string, "ClassRelId">;
// UML visibility marker on a member: `+` public, `-` private, `#` protected, `~` package; null when
// the member text carried no marker.
export type ClassVisibility = "public" | "private" | "protected" | "package";
export type ClassMemberKind = "field" | "method";

export interface ClassMember {
  readonly visibility: ClassVisibility | null;
  // The member text minus the visibility marker, as written (`int age`, `area() double`).
  readonly text: string;
  readonly kind: ClassMemberKind; // `method` when the text has a `()`, else `field`
}

export interface ClassEntity {
  readonly id: ClassEntityId;
  readonly label: string;
  // A `<<interface>>` / `<<abstract>>` / `<<enumeration>>` annotation (the text between the guillemets);
  // null when the class has none.
  readonly stereotype: string | null;
  readonly members: readonly ClassMember[];
}

// One end's UML arrowhead. A subset of `EdgeEnd` (same string values), so it assigns straight onto a
// `SceneEdge` end: `triangle` (inheritance/realization), `diamondFilled` (composition),
// `diamondHollow` (aggregation), `arrowOpen` (association/dependency), `none`.
export type ClassArrow = "none" | "arrowOpen" | "triangle" | "diamondFilled" | "diamondHollow";

export interface ClassRel {
  readonly id: ClassRelId;
  readonly from: ClassEntityId;
  readonly to: ClassEntityId;
  readonly fromArrow: ClassArrow;
  readonly toArrow: ClassArrow;
  readonly dashed: boolean; // `..` dependency/realization vs `--` association/inheritance/composition
  readonly label: string; // the `: text`, "" when omitted
}

export interface ClassAst {
  readonly kind: "class";
  readonly entities: readonly ClassEntity[];
  readonly relationships: readonly ClassRel[];
}

export type ReqEntityId = Brand<string, "ReqEntityId">;
export type ReqRelId = Brand<string, "ReqRelId">;
// The keyword introducing a node: one of the six SysML requirement types, or a plain `element`.
export type ReqKind =
  | "requirement"
  | "functionalRequirement"
  | "performanceRequirement"
  | "interfaceRequirement"
  | "physicalRequirement"
  | "designConstraint"
  | "element";
// The seven SysML requirement relationship verbs.
export type ReqRelKind =
  | "contains"
  | "copies"
  | "derives"
  | "satisfies"
  | "verifies"
  | "refines"
  | "traces";

// A `key: value` body line (`id`/`text`/`risk`/`verifymethod` for a requirement; `type`/`docref` for
// an element). Kept as parsed key + value so the renderer can show them as compartment rows.
export interface ReqField {
  readonly key: string;
  readonly value: string;
}

export interface ReqEntity {
  readonly id: ReqEntityId;
  readonly name: string;
  readonly kind: ReqKind;
  readonly fields: readonly ReqField[];
}

export interface ReqRel {
  readonly id: ReqRelId;
  readonly from: ReqEntityId;
  readonly to: ReqEntityId;
  readonly kind: ReqRelKind;
}

export interface RequirementAst {
  readonly kind: "requirement";
  readonly entities: readonly ReqEntity[];
  readonly relationships: readonly ReqRel[];
}

// Grows one variant per family. The `kind` tag discriminates.
export type DiagramAst =
  | FlowchartAst
  | SequenceAst
  | C4Ast
  | BlockAst
  | NetworkAst
  | CloudAst
  | StateAst
  | ErAst
  | ClassAst
  | RequirementAst;
