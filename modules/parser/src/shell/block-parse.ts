import type { CstNode, IToken } from "chevrotain";
import { childNodes, childTokens, imageOf } from "./cst.js";
import type { Children } from "./cst.js";
import { brand, err, map, ok, positiveInt, type Result } from "@m/std";
import type {
  BlockAst,
  BlockEdge,
  BlockGroup,
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
  // The id-token's own span, so a label-less block can be relabelled by wrapping its id into `id["…"]`.
  readonly idSpan: TextSpan | null;
  readonly icon: IconRef | null;
  // Column span (`a:2`); ≥ 1.
  readonly span: number;
}

// The trailing `:N` column span, if any (a direct `Number` child of the ref/group); ≥ 1.
const spanOf = (children: Children): number => {
  const raw = imageOf(children, "Number");
  if (raw === null) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
};

const readNodeRef = (node: CstNode): Result<Ref, ParseError> => {
  const idTok = childTokens(node.children, "Identifier")[0];
  const id = idTok?.image ?? "";
  const span = spanOf(node.children);
  const idSpan =
    idTok === undefined
      ? null
      : { start: idTok.startOffset, end: idTok.startOffset + idTok.image.length };
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
    return ok({
      id,
      label: id,
      shape: "rect",
      explicit: false,
      labelSpan: null,
      idSpan,
      span,
      icon,
    });
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
      idSpan,
      span,
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
      idSpan,
      span,
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
    idSpan,
    span,
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
  // First id-token span seen per block, kept only for blocks that never carry a label (below).
  const firstIdSpan = new Map<string, TextSpan>();
  const edgeSpans = new Map<EdgeId, TextSpan>();
  const edges: BlockEdge[] = [];
  const groups: BlockGroup[] = [];
  const groupSpans = new Map<NodeId, TextSpan>();
  // A first malformed-ref failure; once set, the walk bails and the parse fails loudly.
  let failure: ParseError | null = null;

  // Walk a statement list, populating the shared maps. Returns this level's `columns N` (if declared)
  // and the ordered ids of its direct children (blocks and nested groups), as declared.
  const walk = (statements: readonly CstNode[]): { columns: number | null; children: NodeId[] } => {
    let levelColumns: number | null = null;
    const children: NodeId[] = [];
    for (const stmt of statements) {
      if (failure !== null) break;
      const colDecl = childNodes(stmt.children, "columnsDecl")[0];
      if (colDecl !== undefined) {
        const raw = imageOf(colDecl.children, "Number");
        if (raw !== null) levelColumns = Number.parseInt(raw, 10);
        continue;
      }

      const group = childNodes(stmt.children, "groupBlock")[0];
      if (group !== undefined) {
        const idTok = childTokens(group.children, "Identifier")[0];
        const gid = brand<string, "NodeId">(idTok?.image ?? "");
        if (idTok !== undefined)
          groupSpans.set(gid, {
            start: idTok.startOffset,
            end: idTok.startOffset + idTok.image.length,
          });
        const inner = walk(childNodes(group.children, "statement"));
        // A group with no `columns` of its own defaults to one row of its direct children.
        const gColumns = positiveInt(
          Math.max(1, Math.trunc(inner.columns ?? inner.children.length)),
        );
        groups.push({
          id: gid,
          label: idTok?.image ?? "",
          columns: gColumns,
          children: inner.children,
          span: positiveInt(spanOf(group.children)),
        });
        children.push(gid);
        continue;
      }

      const chain = childNodes(stmt.children, "chain")[0];
      if (chain === undefined) continue;
      const refs: Ref[] = [];
      for (const refNode of childNodes(chain.children, "nodeRef")) {
        const ref = readNodeRef(refNode);
        if (!ref.ok) {
          failure = ref.error; // malformed `icon "…"` → fail the parse loudly
          break;
        }
        refs.push(ref.value);
      }
      if (failure !== null) break;
      const links = childNodes(chain.children, "link");

      for (const ref of refs) {
        const id = brand<string, "NodeId">(ref.id);
        const existing = blockMap.get(ref.id);
        if (existing === undefined) {
          blockMap.set(ref.id, {
            id,
            label: ref.label,
            shape: ref.shape,
            icon: ref.icon,
            span: positiveInt(ref.span),
          });
          children.push(id); // first declaration fixes the block's container + grid position
        } else if (ref.explicit) {
          blockMap.set(ref.id, {
            id: existing.id,
            label: ref.label,
            shape: ref.shape,
            icon: ref.icon,
            span: existing.span,
          });
        }
        if (ref.labelSpan !== null) blockSpans.set(id, ref.labelSpan);
        if (ref.idSpan !== null && !firstIdSpan.has(ref.id)) firstIdSpan.set(ref.id, ref.idSpan);
      }

      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const from = refs[i];
        const to = refs[i + 1];
        if (link === undefined || from === undefined || to === undefined) {
          failure = parseError(["internal: malformed edge chain"]);
          break;
        }
        const pipe = childTokens(link.children, "PipeText")[0];
        const edgeId = brand<string, "EdgeId">(`e${edges.length}`);
        edges.push({
          id: edgeId,
          from: brand<string, "NodeId">(from.id),
          to: brand<string, "NodeId">(to.id),
          kind: linkKind(link.children),
          label: pipe === undefined ? null : cleanLabel(pipe.image),
        });
        if (pipe !== undefined) edgeSpans.set(edgeId, labelSpan(pipe));
      }
    }
    return { columns: levelColumns, children };
  };

  const top = walk(childNodes(root, "statement"));
  if (failure !== null) return err(failure);

  const blocks = [...blockMap.values()];
  // A block is "bare" (relabel by wrapping its id) when it never carried an explicit label span.
  const bareSpans = new Map<NodeId, TextSpan>();
  for (const [idStr, span] of firstIdSpan) {
    const id = brand<string, "NodeId">(idStr);
    if (!blockSpans.has(id)) bareSpans.set(id, span);
  }
  // Mermaid defaults the grid width to the *top-level* item count when `columns` is omitted; clamp to
  // ≥1 (a finite integer) before minting — so the grid width is `PositiveInt`, never zero.
  const requested =
    top.columns !== null && Number.isFinite(top.columns) ? top.columns : top.children.length;
  const resolved = positiveInt(Math.max(1, Math.trunc(requested)));
  return ok({
    ast: { kind: "block", columns: resolved, blocks, groups, roots: top.children, edges },
    source: { blocks: blockSpans, edges: edgeSpans, bareNodes: bareSpans, groups: groupSpans },
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
