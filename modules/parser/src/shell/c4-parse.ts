import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, ok, type Result } from "@m/std";
import type { C4Ast, C4Element, C4ElementId, C4ElementKind, C4Rel } from "@m/contracts";
import type { ParseError } from "./parse.js";
import { c4Parser } from "./c4-grammar.js";
import { c4Lexer } from "./c4-tokens.js";

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const imageOf = (c: Children, name: string): string | null =>
  childTokens(c, name)[0]?.image ?? null;
const unquote = (s: string): string => s.slice(1, -1);

const elementKind = (c: Children): C4ElementKind => {
  if (childTokens(c, "Person").length > 0) return "person";
  if (childTokens(c, "System").length > 0) return "system";
  return "container";
};

const walkItems = (
  items: readonly CstNode[],
  parent: C4ElementId | null,
  elements: C4Element[],
  rels: C4Rel[],
): void => {
  for (const item of items) {
    const el = childNodes(item.children, "element")[0];
    if (el !== undefined) {
      elements.push({
        id: brand<string, "C4ElementId">(imageOf(el.children, "C4Identifier") ?? ""),
        label: unquote(imageOf(el.children, "QuotedString") ?? '""'),
        kind: elementKind(el.children),
        parent,
      });
      continue;
    }
    const boundary = childNodes(item.children, "boundary")[0];
    if (boundary !== undefined) {
      const id = brand<string, "C4ElementId">(imageOf(boundary.children, "C4Identifier") ?? "");
      elements.push({
        id,
        label: unquote(imageOf(boundary.children, "QuotedString") ?? '""'),
        kind: "boundary",
        parent,
      });
      walkItems(childNodes(boundary.children, "item"), id, elements, rels);
      continue;
    }
    const rel = childNodes(item.children, "rel")[0];
    if (rel === undefined) continue;
    const ids = childTokens(rel.children, "C4Identifier");
    rels.push({
      id: brand<string, "C4RelId">(`r${rels.length}`),
      from: brand<string, "C4ElementId">(ids[0]?.image ?? ""),
      to: brand<string, "C4ElementId">(ids[1]?.image ?? ""),
      label: unquote(imageOf(rel.children, "QuotedString") ?? '""'),
    });
  }
};

const buildAst = (cst: CstNode): Result<C4Ast, ParseError> => {
  const elements: C4Element[] = [];
  const rels: C4Rel[] = [];
  walkItems(childNodes(cst.children, "item"), null, elements, rels);
  return ok({ kind: "c4", elements, rels });
};

export const parseC4 = (text: string): Result<C4Ast, ParseError> => {
  const lexed = c4Lexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err({ kind: "parse", errors: lexed.errors.map((e) => e.message) });
  }
  c4Parser.input = lexed.tokens;
  const cst = c4Parser.c4();
  if (c4Parser.errors.length > 0) {
    return err({ kind: "parse", errors: c4Parser.errors.map((e) => e.message) });
  }
  return buildAst(cst);
};
