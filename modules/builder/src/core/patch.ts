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

const LABELS = /\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|\|[^|]*\|/g;
const NON_IDENT = /[^A-Za-z0-9_]+/;

// Removes a node's declaration line and any edge line that references it. Line-based and
// bracket-aware: labels are stripped, then the line is split into identifier tokens, so an id
// mentioned inside a label can't match. A span-accurate version would need per-line/edge spans.
export const deleteNode = (text: string, id: NodeId): string =>
  text
    .split("\n")
    .filter((line) => !line.replace(LABELS, "").split(NON_IDENT).includes(id))
    .join("\n");

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
