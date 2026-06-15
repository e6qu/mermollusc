// Maps AST identities back to byte ranges in the source text, so the builder can patch the
// exact span a node/edge came from (two-way sync) without reformatting the rest of the file.

import type { ActorId, MessageId, NodeId } from "./ast.js";

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
}

// Editable text spans for a sequence diagram: each actor's label and each message's text.
export interface SequenceSource {
  readonly actors: ReadonlyMap<ActorId, TextSpan>;
  readonly messages: ReadonlyMap<MessageId, TextSpan>;
}
