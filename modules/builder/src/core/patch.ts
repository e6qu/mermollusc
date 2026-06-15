import { err, ok, type Result } from "@m/std";
import type { NodeId, SourceMap, TextSpan } from "@m/contracts";

export interface PatchError {
  readonly kind: "patch";
  readonly message: string;
}

// The primitive behind every two-way edit: replace a source text span with new content.
export const patchSpan = (text: string, span: TextSpan, replacement: string): string =>
  text.slice(0, span.start) + replacement + text.slice(span.end);

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
