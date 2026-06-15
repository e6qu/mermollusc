import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, ok, type Result } from "@m/std";
import type { BlockAst, BlockEdge, BlockNode, EdgeKind, NodeShape } from "@m/contracts";
import type { ParseError } from "./parse.js";
import { blockParser } from "./block-grammar.js";
import { blockLexer } from "./block-tokens.js";

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const imageOf = (c: Children, name: string): string | null =>
  childTokens(c, name)[0]?.image ?? null;

interface Ref {
  readonly id: string;
  readonly label: string;
  readonly shape: NodeShape;
  readonly explicit: boolean;
}

// Block labels are conventionally quoted (`id["text"]`); accept and drop a surrounding pair.
const label = (raw: string): string => {
  const t = raw.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
};

const readNodeRef = (node: CstNode): Ref => {
  const id = imageOf(node.children, "Identifier") ?? "";
  const shapeNode = childNodes(node.children, "shape")[0];
  if (shapeNode === undefined) {
    return { id, label: id, shape: "rect", explicit: false };
  }
  const sc = shapeNode.children;
  const square = imageOf(sc, "SquareText");
  if (square !== null) return { id, label: label(square), shape: "rect", explicit: true };
  const paren = imageOf(sc, "ParenText");
  if (paren !== null) return { id, label: label(paren), shape: "round", explicit: true };
  return { id, label: label(imageOf(sc, "CurlyText") ?? ""), shape: "diamond", explicit: true };
};

const linkKind = (c: Children): EdgeKind => {
  if (childTokens(c, "Arrow").length > 0) return "arrow";
  if (childTokens(c, "OpenLink").length > 0) return "open";
  if (childTokens(c, "DottedArrow").length > 0) return "dotted";
  return "thick";
};

const buildAst = (cst: CstNode): Result<BlockAst, ParseError> => {
  const root = cst.children;
  const blockMap = new Map<string, BlockNode>();
  const edges: BlockEdge[] = [];
  let columns: number | null = null;

  for (const stmt of childNodes(root, "statement")) {
    const colDecl = childNodes(stmt.children, "columnsDecl")[0];
    if (colDecl !== undefined) {
      const raw = imageOf(colDecl.children, "Number");
      if (raw !== null) columns = Number.parseInt(raw, 10);
      continue;
    }

    const chain = childNodes(stmt.children, "chain")[0];
    if (chain === undefined) continue;
    const refs = childNodes(chain.children, "nodeRef").map(readNodeRef);
    const links = childNodes(chain.children, "link");

    for (const ref of refs) {
      const existing = blockMap.get(ref.id);
      if (existing === undefined) {
        blockMap.set(ref.id, {
          id: brand<string, "NodeId">(ref.id),
          label: ref.label,
          shape: ref.shape,
        });
      } else if (ref.explicit) {
        blockMap.set(ref.id, { id: existing.id, label: ref.label, shape: ref.shape });
      }
    }

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const from = refs[i];
      const to = refs[i + 1];
      if (link === undefined || from === undefined || to === undefined) {
        return err({ kind: "parse", errors: ["internal: malformed edge chain"] });
      }
      const label = imageOf(link.children, "PipeText");
      edges.push({
        id: brand<string, "EdgeId">(`e${edges.length}`),
        from: brand<string, "NodeId">(from.id),
        to: brand<string, "NodeId">(to.id),
        kind: linkKind(link.children),
        label: label === null ? null : label.trim(),
      });
    }
  }

  const blocks = [...blockMap.values()];
  // Mermaid defaults to a single row when `columns` is omitted; clamp to a sane minimum.
  const resolved = columns === null ? Math.max(1, blocks.length) : Math.max(1, columns);
  return ok({ kind: "block", columns: resolved, blocks, edges });
};

export const parseBlock = (text: string): Result<BlockAst, ParseError> => {
  const lexed = blockLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err({ kind: "parse", errors: lexed.errors.map((e) => e.message) });
  }
  blockParser.input = lexed.tokens;
  const cst = blockParser.block();
  if (blockParser.errors.length > 0) {
    return err({ kind: "parse", errors: blockParser.errors.map((e) => e.message) });
  }
  return buildAst(cst);
};
