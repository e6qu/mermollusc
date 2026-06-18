// Maps AST identities back to byte ranges in the source text, so the builder can patch the
// exact span a node/edge came from (two-way sync) without reformatting the rest of the file.

import type {
  ActorId,
  C4ElementId,
  C4RelId,
  EdgeId,
  ErEntityId,
  ErRelId,
  MessageId,
  NodeId,
  StateId,
  StateTransitionId,
} from "./ast.js";

export interface TextSpan {
  readonly start: number;
  readonly end: number;
}

export interface NodeSpans {
  readonly id: TextSpan;
  readonly label: TextSpan;
  readonly bracketed: boolean;
}

export interface SourceMap {
  readonly nodes: ReadonlyMap<NodeId, NodeSpans>;
  // Inner `|label|` span for each edge that carries one (for two-way edge-label editing).
  readonly edges: ReadonlyMap<EdgeId, TextSpan>;
}

// Editable text spans for a sequence diagram: each actor's label and each message's text.
export interface SequenceSource {
  readonly actors: ReadonlyMap<ActorId, TextSpan>;
  readonly messages: ReadonlyMap<MessageId, TextSpan>;
}

// Editable text spans for a C4 diagram: the inner (unquoted) label of each element and relation.
export interface C4Source {
  readonly elements: ReadonlyMap<C4ElementId, TextSpan>;
  readonly rels: ReadonlyMap<C4RelId, TextSpan>;
}

// Editable text spans for a block diagram: the label of each explicitly-labelled block and of
// each edge that carries a `|label|`. Bare blocks / unlabelled edges have no entry.
export interface BlockSource {
  readonly blocks: ReadonlyMap<NodeId, TextSpan>;
  readonly edges: ReadonlyMap<EdgeId, TextSpan>;
}

// Editable text spans for a network diagram: the inner label of each node that has a quoted label
// and of each link that carries one. Unlabelled nodes/links have no entry.
export interface NetworkSource {
  readonly nodes: ReadonlyMap<NodeId, TextSpan>;
  readonly links: ReadonlyMap<EdgeId, TextSpan>;
}

// Editable text spans for a state diagram: each state's label (from `id : label` or
// `state "label" as id`) and each transition's `: label`. Bare states / unlabelled transitions have
// no entry; `[*]` pseudo-states never do.
export interface StateSource {
  readonly states: ReadonlyMap<StateId, TextSpan>;
  readonly transitions: ReadonlyMap<StateTransitionId, TextSpan>;
}

// Editable text spans for an ER diagram: each entity's name and each relationship's `: label`.
export interface ErSource {
  readonly entities: ReadonlyMap<ErEntityId, TextSpan>;
  readonly relationships: ReadonlyMap<ErRelId, TextSpan>;
}

// Editable text spans for a cloud diagram: the inner label of each group, each labelled service
// leaf, and each labelled link. Keyed by the element/link id.
export interface CloudSource {
  readonly groups: ReadonlyMap<NodeId, TextSpan>;
  readonly nodes: ReadonlyMap<NodeId, TextSpan>;
  readonly links: ReadonlyMap<EdgeId, TextSpan>;
}
