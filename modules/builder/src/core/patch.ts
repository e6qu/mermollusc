import { err, ok, type Result } from "@m/std";
import type { EdgeKind, NodeId, NodeShape, SourceMap, TextSpan } from "@m/contracts";

export interface PatchError {
  readonly kind: "patch";
  readonly message: string;
}

const NODE_WRAP: Record<NodeShape, readonly [string, string]> = {
  rect: ["[", "]"],
  round: ["(", ")"],
  stadium: ["([", "])"],
  diamond: ["{", "}"],
  circle: ["((", "))"],
};

const ARROW: Record<EdgeKind, string> = {
  arrow: "-->",
  open: "---",
  dotted: "-.->",
  thick: "==>",
};

const withTrailingNewline = (text: string): string => (text.endsWith("\n") ? text : `${text}\n`);

// The primitive behind every two-way edit: replace a source text span with new content.
export const patchSpan = (text: string, span: TextSpan, replacement: string): string =>
  text.slice(0, span.start) + replacement + text.slice(span.end);

// Structural edits append a line, leaving existing text (formatting/comments) intact.
export const addNode = (text: string, id: NodeId, label: string, shape: NodeShape): string => {
  const [open, close] = NODE_WRAP[shape];
  return `${withTrailingNewline(text)}  ${id}${open}${label}${close}\n`;
};

export const connect = (text: string, from: NodeId, to: NodeId, kind: EdgeKind): string =>
  `${withTrailingNewline(text)}  ${from} ${ARROW[kind]} ${to}\n`;

// Two-way edit: rewrite a node's label in the source text, touching only its span so the rest of
// the file (formatting, comments, ordering) is preserved. A bare node gets wrapped in brackets.
export const relabelNode = (
  text: string,
  source: SourceMap,
  id: NodeId,
  label: string,
): Result<string, PatchError> => {
  const spans = source.nodes.get(id);
  if (spans === undefined) return err({ kind: "patch", message: `unknown node: ${id}` });
  const replacement = spans.bracketed ? label : `${id}[${label}]`;
  return ok(patchSpan(text, spans.label, replacement));
};
