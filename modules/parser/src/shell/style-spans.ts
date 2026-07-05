import type { IToken } from "chevrotain";
import type { TextSpan } from "@m/contracts";

// Extracts the editable span of a SINGLE-target styling directive token, so the editor can update or
// remove that one node's/edge's colour in place. Shared by every family's parser (flowchart, state, …)
// so the "which directives are per-node editable" rule lives in ONE place. `keyword` is the leading word
// (`style`/`linkStyle`); the target is the first whitespace-delimited word after it. A comma (multi-
// target `style A,B …` / `linkStyle 0,1 …`) or `default` means it's not a single editable target, so
// null is returned (the colour is shared / not rewritable per node here). The span covers the trimmed
// directive line (leading indentation and trailing whitespace excluded), matching `patchSpan`/removal.
export const singleStyleTarget = (
  token: IToken,
  keyword: string,
): { readonly target: string; readonly span: TextSpan } | null => {
  const trimmed = token.image.trim();
  const rest = trimmed.slice(keyword.length).trim();
  const target = rest.split(/[ \t]/)[0] ?? "";
  if (target === "" || target.includes(",") || target === "default") return null;
  const lead = token.image.length - token.image.trimStart().length;
  return {
    target,
    span: {
      start: token.startOffset + lead,
      end: token.startOffset + token.image.trimEnd().length,
    },
  };
};

// The editable span of a single-index `linkStyle <n> …` directive, keyed by that integer edge index, or
// null for a multi-index / `default` line. Shared by every family so an edge's colour is rewritable in
// place by its declaration index.
export const singleLinkStyleIndex = (
  token: IToken,
): { readonly index: number; readonly span: TextSpan } | null => {
  const single = singleStyleTarget(token, "linkStyle");
  if (single === null) return null;
  const index = Number.parseInt(single.target, 10);
  // Reject non-integer targets (`String(index) === target` rejects e.g. `01`, `1x`).
  if (!Number.isInteger(index) || String(index) !== single.target) return null;
  return { index, span: single.span };
};
