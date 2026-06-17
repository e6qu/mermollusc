import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  C4Ast,
  C4Element,
  C4ElementId,
  C4ElementKind,
  C4Rel,
  C4RelId,
  C4Source,
  TextSpan,
} from "@m/contracts";
import { lexingError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { c4Parser } from "./c4-grammar.js";
import { c4Lexer } from "./c4-tokens.js";

export interface ParsedC4 {
  readonly ast: C4Ast;
  readonly source: C4Source;
}

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const imageOf = (c: Children, name: string): string | null =>
  childTokens(c, name)[0]?.image ?? null;
const unquote = (s: string): string => s.slice(1, -1);

// Inner span of a `"…"` token (offsets of the text between the quotes), so a relabel patch
// replaces only the label and leaves the quotes in place. Derived from the image length because
// Chevrotain's `endOffset` is optional.
const innerSpan = (t: IToken): TextSpan => ({
  start: t.startOffset + 1,
  end: t.startOffset + t.image.length - 1,
});

const elementKind = (c: Children): C4ElementKind => {
  if (childTokens(c, "Person").length > 0) return "person";
  if (childTokens(c, "System").length > 0) return "system";
  return "container";
};

interface C4Acc {
  readonly elements: C4Element[];
  readonly rels: C4Rel[];
  readonly elementSpans: Map<C4ElementId, TextSpan>;
  readonly relSpans: Map<C4RelId, TextSpan>;
}

const quotedSpan = (c: Children): TextSpan | null => {
  const tok = childTokens(c, "QuotedString")[0];
  return tok === undefined ? null : innerSpan(tok);
};

const walkItems = (items: readonly CstNode[], parent: C4ElementId | null, acc: C4Acc): void => {
  for (const item of items) {
    const el = childNodes(item.children, "element")[0];
    if (el !== undefined) {
      const id = brand<string, "C4ElementId">(imageOf(el.children, "C4Identifier") ?? "");
      const span = quotedSpan(el.children);
      if (span !== null) acc.elementSpans.set(id, span);
      acc.elements.push({
        id,
        label: unquote(imageOf(el.children, "QuotedString") ?? '""'),
        kind: elementKind(el.children),
        parent,
      });
      continue;
    }
    const boundary = childNodes(item.children, "boundary")[0];
    if (boundary !== undefined) {
      const id = brand<string, "C4ElementId">(imageOf(boundary.children, "C4Identifier") ?? "");
      const span = quotedSpan(boundary.children);
      if (span !== null) acc.elementSpans.set(id, span);
      acc.elements.push({
        id,
        label: unquote(imageOf(boundary.children, "QuotedString") ?? '""'),
        kind: "boundary",
        parent,
      });
      walkItems(childNodes(boundary.children, "item"), id, acc);
      continue;
    }
    const rel = childNodes(item.children, "rel")[0];
    if (rel === undefined) continue;
    const ids = childTokens(rel.children, "C4Identifier");
    const relId = brand<string, "C4RelId">(`r${acc.rels.length}`);
    const span = quotedSpan(rel.children);
    if (span !== null) acc.relSpans.set(relId, span);
    acc.rels.push({
      id: relId,
      from: brand<string, "C4ElementId">(ids[0]?.image ?? ""),
      to: brand<string, "C4ElementId">(ids[1]?.image ?? ""),
      label: unquote(imageOf(rel.children, "QuotedString") ?? '""'),
    });
  }
};

const buildResult = (cst: CstNode): Result<ParsedC4, ParseError> => {
  const acc: C4Acc = {
    elements: [],
    rels: [],
    elementSpans: new Map(),
    relSpans: new Map(),
  };
  walkItems(childNodes(cst.children, "item"), null, acc);
  return ok({
    ast: { kind: "c4", elements: acc.elements, rels: acc.rels },
    source: { elements: acc.elementSpans, rels: acc.relSpans },
  });
};

export const parseC4WithSource = (text: string): Result<ParsedC4, ParseError> => {
  const lexed = c4Lexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err(lexingError(lexed.errors));
  }
  c4Parser.input = lexed.tokens;
  const cst = c4Parser.c4();
  if (c4Parser.errors.length > 0) {
    return err(recognitionError(c4Parser.errors));
  }
  return buildResult(cst);
};

export const parseC4 = (text: string): Result<C4Ast, ParseError> =>
  map(parseC4WithSource(text), (parsed) => parsed.ast);
