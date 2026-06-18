import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  StateAst,
  StateId,
  StateKind,
  StateNode,
  StateSource,
  StateTransition,
  StateTransitionId,
  TextSpan,
} from "@m/contracts";
import { lexingError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { stateParser } from "./state-grammar.js";
import { stateLexer } from "./state-tokens.js";

export interface ParsedState {
  readonly ast: StateAst;
  readonly source: StateSource;
}

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const unquote = (s: string): string => s.slice(1, -1);

// The two `[*]` pseudo-states: one initial (a transition source), one final (a transition target).
const START = "__state_start";
const END = "__state_end";

// Span of a label token's trimmed text (the text after `:` carries a leading space).
const trimmedSpan = (t: IToken): TextSpan => {
  const lead = t.image.length - t.image.trimStart().length;
  const start = t.startOffset + lead;
  return { start, end: start + t.image.trim().length };
};

// Inner span of a `"…"` token, so a relabel replaces only the text between the quotes.
const innerSpan = (t: IToken): TextSpan => ({
  start: t.startOffset + 1,
  end: t.startOffset + t.image.length - 1,
});

interface Endpoint {
  readonly star: boolean;
  readonly image: string;
}

const endpointOf = (ep: CstNode): Endpoint => {
  const star = childTokens(ep.children, "StateStar")[0];
  if (star !== undefined) return { star: true, image: star.image };
  return { star: false, image: childTokens(ep.children, "StateIdentifier")[0]?.image ?? "" };
};

const buildResult = (cst: CstNode): Result<ParsedState, ParseError> => {
  const root = cst.children;
  // Insertion-ordered: a state's first mention fixes its position; the label is last-write-wins.
  const kinds = new Map<string, StateKind>();
  const labels = new Map<string, string>();
  const stateSpans = new Map<StateId, TextSpan>();
  const transitions: StateTransition[] = [];
  const transitionSpans = new Map<StateTransitionId, TextSpan>();

  const seeReal = (id: string, label: string | null): void => {
    if (!kinds.has(id)) kinds.set(id, "state");
    if (label !== null) labels.set(id, label);
    else if (!labels.has(id)) labels.set(id, id);
  };
  const resolve = (ep: Endpoint, role: "source" | "target"): string => {
    if (!ep.star) {
      seeReal(ep.image, null);
      return ep.image;
    }
    const id = role === "source" ? START : END;
    kinds.set(id, role === "source" ? "start" : "end");
    return id;
  };

  for (const stmt of childNodes(root, "stateStatement")) {
    const decl = childNodes(stmt.children, "stateDecl")[0];
    if (decl !== undefined) {
      const id = childTokens(decl.children, "StateIdentifier")[0]?.image ?? "";
      const quoted = childTokens(decl.children, "StateQuotedString")[0];
      if (quoted !== undefined) {
        seeReal(id, unquote(quoted.image));
        stateSpans.set(brand<string, "StateId">(id), innerSpan(quoted));
      }
      continue;
    }

    const line = childNodes(stmt.children, "stateLine")[0];
    if (line === undefined) continue;
    const endpoints = childNodes(line.children, "stateEndpoint");
    const ep1 = endpoints[0];
    if (ep1 === undefined) continue;
    const label = childTokens(line.children, "StateLabelText")[0];

    if (childTokens(line.children, "StateArrow").length > 0) {
      const ep2 = endpoints[1];
      if (ep2 === undefined) continue;
      const from = resolve(endpointOf(ep1), "source");
      const to = resolve(endpointOf(ep2), "target");
      const id = brand<string, "StateTransitionId">(`t${transitions.length}`);
      transitions.push({
        id,
        from: brand<string, "StateId">(from),
        to: brand<string, "StateId">(to),
        label: label === undefined ? null : label.image.trim(),
      });
      if (label !== undefined) transitionSpans.set(id, trimmedSpan(label));
      continue;
    }

    // `A : label` — a state description; `[*] : …` is meaningless, so ignore it.
    const e = endpointOf(ep1);
    if (e.star || label === undefined) continue;
    seeReal(e.image, label.image.trim());
    stateSpans.set(brand<string, "StateId">(e.image), trimmedSpan(label));
  }

  const states: StateNode[] = [...kinds].map(([id, kind]) => ({
    id: brand<string, "StateId">(id),
    label: kind === "state" ? (labels.get(id) ?? id) : "",
    kind,
  }));
  return ok({
    ast: { kind: "state", states, transitions },
    source: { states: stateSpans, transitions: transitionSpans },
  });
};

export const parseStateWithSource = (text: string): Result<ParsedState, ParseError> => {
  const lexed = stateLexer.tokenize(text);
  if (lexed.errors.length > 0) return err(lexingError(lexed.errors));
  stateParser.input = lexed.tokens;
  const cst = stateParser.state();
  if (stateParser.errors.length > 0) return err(recognitionError(stateParser.errors));
  return buildResult(cst);
};

export const parseState = (text: string): Result<StateAst, ParseError> =>
  map(parseStateWithSource(text), (parsed) => parsed.ast);
