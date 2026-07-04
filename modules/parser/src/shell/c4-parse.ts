import type { CstNode, IToken } from "chevrotain";
import { childNodes, childTokens, imageOf } from "./cst.js";
import type { Children } from "./cst.js";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  C4Ast,
  FlowStyle,
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
  readonly styles: FlowStyle[];
  readonly elementSpans: Map<C4ElementId, TextSpan>;
  readonly relSpans: Map<C4RelId, TextSpan>;
}

// `UpdateElementStyle(id, $bgColor="#f00", $borderColor="#333")` → a `style id fill:#f00,stroke:#333`
// directive, mapping C4's colour args onto the shared fill/stroke model ($fontColor has no home in that
// model, so it's accepted but dropped). Returns null when no mappable colour arg is present.
const styleFromArgs = (id: string, args: readonly CstNode[]): FlowStyle | null => {
  const props: string[] = [];
  for (const arg of args) {
    const key = childTokens(arg.children, "C4StyleArg")[0]?.image;
    const val = childTokens(arg.children, "QuotedString")[0];
    if (key === undefined || val === undefined) continue;
    const value = unquote(val.image);
    if (key === "$bgColor") props.push(`fill:${value}`);
    else if (key === "$borderColor") props.push(`stroke:${value}`);
  }
  return props.length === 0 ? null : { kind: "style", raw: `style ${id} ${props.join(",")}` };
};

const quotedSpan = (c: Children): TextSpan | null => {
  const tok = childTokens(c, "QuotedString")[0];
  return tok === undefined ? null : innerSpan(tok);
};

// The optional second quoted string of an element (`Person(id, "label", "description")`), or null.
const descriptionOf = (c: Children): string | null => {
  const tok = childTokens(c, "QuotedString")[1];
  return tok === undefined ? null : unquote(tok.image);
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
        description: descriptionOf(el.children),
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
        description: null,
        kind: "boundary",
        parent,
      });
      walkItems(childNodes(boundary.children, "item"), id, acc);
      continue;
    }
    const ues = childNodes(item.children, "updateElementStyle")[0];
    if (ues !== undefined) {
      const id = imageOf(ues.children, "C4Identifier") ?? "";
      const style = styleFromArgs(id, childNodes(ues.children, "c4StyleArg"));
      if (style !== null) acc.styles.push(style);
      continue;
    }
    // `UpdateRelStyle(from, to, $lineColor=…)` is accepted so it doesn't break the parse; C4 relationship
    // colouring isn't in the shared fill/stroke edge model, so nothing is synthesised for it here.
    if (childNodes(item.children, "updateRelStyle")[0] !== undefined) continue;
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
    styles: [],
    elementSpans: new Map(),
    relSpans: new Map(),
  };
  walkItems(childNodes(cst.children, "item"), null, acc);
  return ok({
    ast: { kind: "c4", elements: acc.elements, rels: acc.rels, styles: acc.styles },
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
