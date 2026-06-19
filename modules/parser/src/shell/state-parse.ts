import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  StateAst,
  StateComposite,
  StateId,
  StateKind,
  StateNode,
  StateNote,
  StateSource,
  StateTransition,
  StateTransitionId,
  TextSpan,
} from "@m/contracts";
import { lexingError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { stateParser } from "./state-grammar.js";
import { stateLexer } from "./state-tokens.js";

const ANNOTATION_KIND: Record<string, StateKind> = {
  fork: "fork",
  join: "join",
  choice: "choice",
};

export interface ParsedState {
  readonly ast: StateAst;
  readonly source: StateSource;
}

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const unquote = (s: string): string => s.slice(1, -1);

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

// Per-composite `[*]` pseudo-state ids — each scope (the root, or a `state X { … }` block) has its
// own initial / final, so a nested `[*]` doesn't collide with the top-level one.
const pseudoId = (scope: string | null, role: "start" | "end"): string =>
  scope === null ? `__${role}` : `__${role}__${scope}`;

const buildResult = (cst: CstNode): Result<ParsedState, ParseError> => {
  const kinds = new Map<string, StateKind>(); // every state incl. pseudo, in first-mention order
  const labels = new Map<string, string>();
  const compositeIds = new Set<string>();
  const compositeLabel = new Map<string, string>();
  const compositeParent = new Map<string, string | null>();
  const memberOf = new Map<string, Set<string>>(); // composite id → its direct members
  const stateSpans = new Map<StateId, TextSpan>();
  const transitions: StateTransition[] = [];
  const transitionSpans = new Map<StateTransitionId, TextSpan>();
  const notes: StateNote[] = [];

  const addMember = (composite: string | null, id: string): void => {
    if (composite === null) return; // top-level membership is implicit (absence from any composite)
    const set = memberOf.get(composite) ?? new Set<string>();
    set.add(id);
    memberOf.set(composite, set);
  };
  const seeReal = (id: string, label: string | null, scope: string | null): void => {
    if (!kinds.has(id)) {
      kinds.set(id, "state");
      addMember(scope, id);
    }
    if (label !== null) labels.set(id, label);
    else if (!labels.has(id)) labels.set(id, id);
  };
  const resolve = (ep: Endpoint, role: "start" | "end", scope: string | null): string => {
    if (!ep.star) {
      seeReal(ep.image, null, scope);
      return ep.image;
    }
    const id = pseudoId(scope, role);
    if (!kinds.has(id)) {
      kinds.set(id, role);
      addMember(scope, id);
    }
    return id;
  };

  const walkLine = (line: CstNode, scope: string | null): void => {
    const endpoints = childNodes(line.children, "stateEndpoint");
    const ep1 = endpoints[0];
    if (ep1 === undefined) return;
    const label = childTokens(line.children, "StateLabelText")[0];
    if (childTokens(line.children, "StateArrow").length > 0) {
      const ep2 = endpoints[1];
      if (ep2 === undefined) return;
      const from = resolve(endpointOf(ep1), "start", scope);
      const to = resolve(endpointOf(ep2), "end", scope);
      const id = brand<string, "StateTransitionId">(`t${transitions.length}`);
      transitions.push({
        id,
        from: brand<string, "StateId">(from),
        to: brand<string, "StateId">(to),
        label: label === undefined ? null : label.image.trim(),
      });
      if (label !== undefined) transitionSpans.set(id, trimmedSpan(label));
      return;
    }
    // `A : label` — a state description; `[*] : …` is meaningless, so ignore it.
    const e = endpointOf(ep1);
    if (e.star || label === undefined) return;
    seeReal(e.image, label.image.trim(), scope);
    stateSpans.set(brand<string, "StateId">(e.image), trimmedSpan(label));
  };

  const walk = (statements: readonly CstNode[], scope: string | null): void => {
    for (const stmt of statements) {
      const decl = childNodes(stmt.children, "stateDecl")[0];
      if (decl !== undefined) {
        const quoted = childTokens(decl.children, "StateQuotedString")[0];
        const id = childTokens(decl.children, "StateIdentifier")[0]?.image ?? "";
        const label = quoted === undefined ? id : unquote(quoted.image);
        const block = childNodes(decl.children, "stateBlock")[0];
        if (block !== undefined) {
          // A `state X { … }` composite: a container, not a leaf state.
          compositeIds.add(id);
          compositeLabel.set(id, label);
          if (!compositeParent.has(id)) compositeParent.set(id, scope);
          addMember(scope, id);
          if (quoted !== undefined) stateSpans.set(brand<string, "StateId">(id), innerSpan(quoted));
          walk(childNodes(block.children, "stateStatement"), id);
        } else {
          seeReal(id, label, scope);
          // A `<<fork>>`/`<<join>>`/`<<choice>>` annotation overrides the kind (and so the rendered
          // shape); these carry no label.
          const ann = childTokens(decl.children, "StateAnnotation")[0];
          if (ann !== undefined) {
            const inner = ann.image.replace(/[<>\s]/g, "");
            const k = ANNOTATION_KIND[inner];
            if (k !== undefined) kinds.set(id, k);
          }
          if (quoted !== undefined) stateSpans.set(brand<string, "StateId">(id), innerSpan(quoted));
        }
        continue;
      }
      const note = childNodes(stmt.children, "noteStmt")[0];
      if (note !== undefined) {
        const target = childTokens(note.children, "StateIdentifier")[0];
        const text = childTokens(note.children, "StateLabelText")[0];
        if (target !== undefined && text !== undefined) {
          notes.push({
            id: brand<string, "StateId">(`__note_${notes.length}`),
            target: brand<string, "StateId">(target.image),
            text: text.image.trim(),
          });
        }
        continue;
      }
      const line = childNodes(stmt.children, "stateLine")[0];
      if (line !== undefined) walkLine(line, scope);
    }
  };

  walk(childNodes(cst.children, "stateStatement"), null);

  const states: StateNode[] = [...kinds]
    .filter(([id]) => !compositeIds.has(id))
    .map(([id, kind]) => ({
      id: brand<string, "StateId">(id),
      label: kind === "state" ? (labels.get(id) ?? id) : "",
      kind,
    }));
  const composites: StateComposite[] = [...compositeIds].map((id) => ({
    id: brand<string, "StateId">(id),
    label: compositeLabel.get(id) ?? id,
    parent: (() => {
      const p = compositeParent.get(id) ?? null;
      return p === null ? null : brand<string, "StateId">(p);
    })(),
    states: [...(memberOf.get(id) ?? new Set<string>())].map((m) => brand<string, "StateId">(m)),
  }));
  return ok({
    ast: { kind: "state", states, transitions, composites, notes },
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
