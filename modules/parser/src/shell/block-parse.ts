import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  BlockAst,
  BlockEdge,
  BlockNode,
  BlockSource,
  EdgeId,
  EdgeKind,
  IconRef,
  NodeId,
  NodeShape,
  TextSpan,
} from "@m/contracts";
import { lexingError, parseError, parseErrorAt, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { iconRefOf } from "./icon-ref.js";
import { blockParser } from "./block-grammar.js";
import { blockLexer } from "./block-tokens.js";

export interface ParsedBlock {
  readonly ast: BlockAst;
  readonly source: BlockSource;
}

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const imageOf = (c: Children, name: string): string | null =>
  childTokens(c, name)[0]?.image ?? null;

// Block labels are conventionally quoted (`id["text"]`); accept and drop a surrounding pair.
const cleanLabel = (raw: string): string => {
  const t = raw.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
};

// Span of the editable label inside a bracket/pipe token: skips surrounding whitespace and a
// matching quote pair, so a patch replaces exactly the visible label text.
const labelSpan = (t: IToken): TextSpan => {
  const leading = t.image.length - t.image.trimStart().length;
  const trimmed = t.image.trim();
  const quoted = trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"');
  const start = t.startOffset + leading + (quoted ? 1 : 0);
  return { start, end: start + trimmed.length - (quoted ? 2 : 0) };
};

interface Ref {
  readonly id: string;
  readonly label: string;
  readonly shape: NodeShape;
  readonly explicit: boolean;
  readonly labelSpan: TextSpan | null;
  readonly icon: IconRef | null;
}

const readNodeRef = (node: CstNode): Result<Ref, ParseError> => {
  const id = imageOf(node.children, "Identifier") ?? "";
  // The optional `icon "<pack>/<name>"` is a sibling of the shape, on the nodeRef directly. A
  // malformed ref fails the parse loudly (located at the token) rather than silently dropping it.
  const iconTok = childTokens(node.children, "BlockQuoted")[0];
  let icon: IconRef | null = null;
  if (iconTok !== undefined) {
    const ref = iconRefOf(iconTok.image);
    if (!ref.ok) return err(parseErrorAt(ref.error, iconTok.startOffset, iconTok.image.length));
    icon = ref.value;
  }
  const shapeNode = childNodes(node.children, "shape")[0];
  if (shapeNode === undefined) {
    return ok({ id, label: id, shape: "rect", explicit: false, labelSpan: null, icon });
  }
  const sc = shapeNode.children;
  const square = childTokens(sc, "SquareText")[0];
  if (square !== undefined) {
    return ok({
      id,
      label: cleanLabel(square.image),
      shape: "rect",
      explicit: true,
      labelSpan: labelSpan(square),
      icon,
    });
  }
  const paren = childTokens(sc, "ParenText")[0];
  if (paren !== undefined) {
    return ok({
      id,
      label: cleanLabel(paren.image),
      shape: "round",
      explicit: true,
      labelSpan: labelSpan(paren),
      icon,
    });
  }
  const curly = childTokens(sc, "CurlyText")[0];
  return ok({
    id,
    label: cleanLabel(curly?.image ?? ""),
    shape: "diamond",
    explicit: true,
    labelSpan: curly === undefined ? null : labelSpan(curly),
    icon,
  });
};

const linkKind = (c: Children): EdgeKind => {
  if (childTokens(c, "Arrow").length > 0) return "arrow";
  if (childTokens(c, "OpenLink").length > 0) return "open";
  if (childTokens(c, "DottedArrow").length > 0) return "dotted";
  return "thick";
};

const buildResult = (cst: CstNode): Result<ParsedBlock, ParseError> => {
  const root = cst.children;
  const blockMap = new Map<string, BlockNode>();
  const blockSpans = new Map<NodeId, TextSpan>();
  const edgeSpans = new Map<EdgeId, TextSpan>();
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
    const refs: Ref[] = [];
    for (const refNode of childNodes(chain.children, "nodeRef")) {
      const ref = readNodeRef(refNode);
      if (!ref.ok) return err(ref.error); // malformed `icon "…"` → fail the parse loudly
      refs.push(ref.value);
    }
    const links = childNodes(chain.children, "link");

    for (const ref of refs) {
      const id = brand<string, "NodeId">(ref.id);
      const existing = blockMap.get(ref.id);
      if (existing === undefined) {
        blockMap.set(ref.id, { id, label: ref.label, shape: ref.shape, icon: ref.icon });
      } else if (ref.explicit) {
        blockMap.set(ref.id, {
          id: existing.id,
          label: ref.label,
          shape: ref.shape,
          icon: ref.icon,
        });
      }
      if (ref.labelSpan !== null) blockSpans.set(id, ref.labelSpan);
    }

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const from = refs[i];
      const to = refs[i + 1];
      if (link === undefined || from === undefined || to === undefined) {
        return err(parseError(["internal: malformed edge chain"]));
      }
      const pipe = childTokens(link.children, "PipeText")[0];
      const edgeId = brand<string, "EdgeId">(`e${edges.length}`);
      edges.push({
        id: edgeId,
        from: brand<string, "NodeId">(from.id),
        to: brand<string, "NodeId">(to.id),
        kind: linkKind(link.children),
        label: pipe === undefined ? null : pipe.image.trim(),
      });
      if (pipe !== undefined) edgeSpans.set(edgeId, labelSpan(pipe));
    }
  }

  const blocks = [...blockMap.values()];
  // Mermaid defaults to a single row when `columns` is omitted; clamp to a sane minimum.
  const resolved = columns === null ? Math.max(1, blocks.length) : Math.max(1, columns);
  return ok({
    ast: { kind: "block", columns: resolved, blocks, edges },
    source: { blocks: blockSpans, edges: edgeSpans },
  });
};

export const parseBlockWithSource = (text: string): Result<ParsedBlock, ParseError> => {
  const lexed = blockLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err(lexingError(lexed.errors));
  }
  blockParser.input = lexed.tokens;
  const cst = blockParser.block();
  if (blockParser.errors.length > 0) {
    return err(recognitionError(blockParser.errors));
  }
  return buildResult(cst);
};

export const parseBlock = (text: string): Result<BlockAst, ParseError> =>
  map(parseBlockWithSource(text), (parsed) => parsed.ast);
