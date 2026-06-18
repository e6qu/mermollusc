import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  ErAst,
  ErCardinality,
  ErEntity,
  ErEntityId,
  ErRelationship,
  ErRelId,
  ErSource,
  TextSpan,
} from "@m/contracts";
import { lexingError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { erParser } from "./er-grammar.js";
import { erLexer } from "./er-tokens.js";

export interface ParsedEr {
  readonly ast: ErAst;
  readonly source: ErSource;
}

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const unquote = (s: string): string => s.slice(1, -1);

const trimmedSpan = (t: IToken): TextSpan => {
  const lead = t.image.length - t.image.trimStart().length;
  const start = t.startOffset + lead;
  return { start, end: start + t.image.trim().length };
};
const innerSpan = (t: IToken): TextSpan => ({
  start: t.startOffset + 1,
  end: t.startOffset + t.image.length - 1,
});

const LEFT_CARD: Record<string, ErCardinality> = {
  "||": "one",
  "|o": "zeroOrOne",
  "}|": "oneOrMany",
  "}o": "zeroOrMany",
};
const RIGHT_CARD: Record<string, ErCardinality> = {
  "||": "one",
  "o|": "zeroOrOne",
  "|{": "oneOrMany",
  "o{": "zeroOrMany",
};
const REL = /^(\|o|\|\||\}o|\}\|)(--|\.\.)(o\||\|\||o\{|\|\{)$/;

interface Endpoint {
  readonly id: string;
  readonly label: string;
  readonly span: TextSpan;
}

const endpointOf = (ep: CstNode): Endpoint | null => {
  const quoted = childTokens(ep.children, "ErQuotedString")[0];
  if (quoted !== undefined) {
    return { id: unquote(quoted.image), label: unquote(quoted.image), span: innerSpan(quoted) };
  }
  const id = childTokens(ep.children, "ErIdentifier")[0];
  if (id === undefined) return null;
  return {
    id: id.image,
    label: id.image,
    span: { start: id.startOffset, end: id.startOffset + id.image.length },
  };
};

const buildResult = (cst: CstNode): Result<ParsedEr, ParseError> => {
  const labels = new Map<string, string>(); // entity id → label, first-mention order
  const entitySpans = new Map<ErEntityId, TextSpan>();
  const relationships: ErRelationship[] = [];
  const relSpans = new Map<ErRelId, TextSpan>();

  const seeEntity = (e: Endpoint): void => {
    if (!labels.has(e.id)) labels.set(e.id, e.label);
    if (!entitySpans.has(brand<string, "ErEntityId">(e.id))) {
      entitySpans.set(brand<string, "ErEntityId">(e.id), e.span);
    }
  };

  for (const stmt of childNodes(cst.children, "erStatement")) {
    const endpoints = childNodes(stmt.children, "erEntity");
    const left = endpoints[0] === undefined ? null : endpointOf(endpoints[0]);
    if (left === null) continue;
    seeEntity(left);
    const relTok = childTokens(stmt.children, "ErRelationship")[0];
    if (relTok === undefined) continue; // bare entity declaration
    const right = endpoints[1] === undefined ? null : endpointOf(endpoints[1]);
    if (right === null) continue;
    seeEntity(right);
    const m = REL.exec(relTok.image);
    if (m === null) continue;
    const [, leftSym = "", line = "", rightSym = ""] = m;
    const id = brand<string, "ErRelId">(`r${relationships.length}`);
    const label = childTokens(stmt.children, "ErLabelText")[0];
    relationships.push({
      id,
      from: brand<string, "ErEntityId">(left.id),
      to: brand<string, "ErEntityId">(right.id),
      fromCard: LEFT_CARD[leftSym] ?? "one",
      toCard: RIGHT_CARD[rightSym] ?? "one",
      identifying: line === "--",
      label: label === undefined ? "" : label.image.trim(),
    });
    if (label !== undefined) relSpans.set(id, trimmedSpan(label));
  }

  const entities: ErEntity[] = [...labels].map(([id, label]) => ({
    id: brand<string, "ErEntityId">(id),
    label,
  }));
  return ok({
    ast: { kind: "er", entities, relationships },
    source: { entities: entitySpans, relationships: relSpans },
  });
};

export const parseErWithSource = (text: string): Result<ParsedEr, ParseError> => {
  const lexed = erLexer.tokenize(text);
  if (lexed.errors.length > 0) return err(lexingError(lexed.errors));
  erParser.input = lexed.tokens;
  const cst = erParser.er();
  if (erParser.errors.length > 0) return err(recognitionError(erParser.errors));
  return buildResult(cst);
};

export const parseEr = (text: string): Result<ErAst, ParseError> =>
  map(parseErWithSource(text), (parsed) => parsed.ast);
