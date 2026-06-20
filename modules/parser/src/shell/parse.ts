import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  EdgeId,
  EdgeKind,
  FlowDirection,
  FlowEdge,
  FlowNode,
  FlowSubgraph,
  FlowchartAst,
  NodeId,
  NodeShape,
  NodeSpans,
  SourceMap,
  TextSpan,
} from "@m/contracts";
import { flowchartParser } from "./grammar.js";
import { lexingError, parseError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { lexer } from "./tokens.js";

export type { ParseError } from "./parse-error.js";

export interface ParsedSource {
  readonly ast: FlowchartAst;
  readonly source: SourceMap;
}

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const imageOf = (c: Children, name: string): string | null =>
  childTokens(c, name)[0]?.image ?? null;
const spanOf = (t: IToken): TextSpan => ({
  start: t.startOffset,
  end: (t.endOffset ?? t.startOffset) + 1,
});

// Span of a token's trimmed text — `|label|` pipe text may carry padding spaces around the label.
const trimmedSpan = (t: IToken): TextSpan => {
  const lead = t.image.length - t.image.trimStart().length;
  const start = t.startOffset + lead;
  return { start, end: start + t.image.trim().length };
};

const ZERO_SPAN: TextSpan = { start: 0, end: 0 };

const toDirection = (raw: string | null): FlowDirection | null => {
  if (raw === null) return "TB";
  switch (raw.toUpperCase()) {
    case "TB":
    case "TD":
      return "TB";
    case "BT":
      return "BT";
    case "LR":
      return "LR";
    case "RL":
      return "RL";
    default:
      return null;
  }
};

interface Ref {
  readonly id: string;
  readonly label: string;
  readonly shape: NodeShape;
  readonly explicit: boolean;
  readonly idSpan: TextSpan;
  readonly labelSpan: TextSpan;
  // The whole declaration span (id + shape brackets), so a reshape can rewrite the brackets.
  readonly declSpan: TextSpan;
  readonly bracketed: boolean;
}

const readNodeRef = (node: CstNode): Ref => {
  const c = node.children;
  const idToken = childTokens(c, "Identifier")[0];
  const id = idToken?.image ?? "";
  const idSpan = idToken === undefined ? ZERO_SPAN : spanOf(idToken);

  const shapeNode = childNodes(c, "shape")[0];
  if (shapeNode === undefined) {
    return {
      id,
      label: id,
      shape: "rect",
      explicit: false,
      idSpan,
      labelSpan: idSpan,
      declSpan: idSpan,
      bracketed: false,
    };
  }

  // The declaration span runs from the id to past the closing bracket(s); the label token is the inner
  // text, so the close sits `closeLen` chars after it (`]`/`)`/`}` = 1, `])`/`))` = 2).
  const declTo = (label: TextSpan, closeLen: number): TextSpan => ({
    start: idSpan.start,
    end: label.end + closeLen,
  });

  const sc = shapeNode.children;
  const square = childTokens(sc, "SquareText")[0];
  if (square !== undefined) {
    const labelSpan = spanOf(square);
    return {
      id,
      label: square.image.trim(),
      shape: "rect",
      explicit: true,
      idSpan,
      labelSpan,
      declSpan: declTo(labelSpan, 1),
      bracketed: true,
    };
  }
  const stadium = childTokens(sc, "StadiumText")[0];
  if (stadium !== undefined) {
    const labelSpan = spanOf(stadium);
    return {
      id,
      label: stadium.image.trim(),
      shape: "stadium",
      explicit: true,
      idSpan,
      labelSpan,
      declSpan: declTo(labelSpan, 2),
      bracketed: true,
    };
  }
  const circle = childTokens(sc, "CircleText")[0];
  if (circle !== undefined) {
    const labelSpan = spanOf(circle);
    return {
      id,
      label: circle.image.trim(),
      shape: "circle",
      explicit: true,
      idSpan,
      labelSpan,
      declSpan: declTo(labelSpan, 2),
      bracketed: true,
    };
  }
  const paren = childTokens(sc, "ParenText")[0];
  if (paren !== undefined) {
    const labelSpan = spanOf(paren);
    return {
      id,
      label: paren.image.trim(),
      shape: "round",
      explicit: true,
      idSpan,
      labelSpan,
      declSpan: declTo(labelSpan, 1),
      bracketed: true,
    };
  }
  const curly = childTokens(sc, "CurlyText")[0];
  const labelSpan = curly === undefined ? idSpan : spanOf(curly);
  return {
    id,
    label: (curly?.image ?? "").trim(),
    shape: "diamond",
    explicit: true,
    idSpan,
    labelSpan,
    declSpan: curly === undefined ? idSpan : declTo(labelSpan, 1),
    bracketed: true,
  };
};

const linkKind = (c: Children): EdgeKind => {
  if (childTokens(c, "Arrow").length > 0) return "arrow";
  if (childTokens(c, "OpenLink").length > 0) return "open";
  if (childTokens(c, "DottedArrow").length > 0) return "dotted";
  return "thick";
};

// A subgraph's title is its optional `[label]` (any shape bracket), else its id.
const subgraphLabel = (blockChildren: Children, fallback: string): string => {
  const shapeNode = childNodes(blockChildren, "shape")[0];
  if (shapeNode === undefined) return fallback;
  const sc = shapeNode.children;
  const tok =
    childTokens(sc, "SquareText")[0] ??
    childTokens(sc, "ParenText")[0] ??
    childTokens(sc, "CurlyText")[0] ??
    childTokens(sc, "StadiumText")[0] ??
    childTokens(sc, "CircleText")[0];
  return tok === undefined ? fallback : tok.image.trim();
};

const buildResult = (cst: CstNode): Result<ParsedSource, ParseError> => {
  const root = cst.children;
  const headerNode = childNodes(root, "header")[0];
  const dirRaw = headerNode === undefined ? null : imageOf(headerNode.children, "Identifier");
  const direction = toDirection(dirRaw);
  if (direction === null) {
    return err(parseError([`invalid flowchart direction: ${dirRaw ?? ""}`]));
  }

  const nodeMap = new Map<string, FlowNode>();
  const nodeSpans = new Map<NodeId, NodeSpans>();
  const edgeSpans = new Map<EdgeId, TextSpan>();
  const edges: FlowEdge[] = [];
  const subgraphs: FlowSubgraph[] = [];
  const claimed = new Set<string>();
  let malformed = false;

  // Records the refs' nodes/spans and the chain's edges; returns the statement's node ids in order.
  const processStatement = (stmt: CstNode): readonly string[] => {
    const refs = childNodes(stmt.children, "nodeRef").map(readNodeRef);
    const links = childNodes(stmt.children, "link");
    for (const ref of refs) {
      const existing = nodeMap.get(ref.id);
      if (existing === undefined) {
        const nodeId = brand<string, "NodeId">(ref.id);
        nodeMap.set(ref.id, { id: nodeId, label: ref.label, shape: ref.shape });
        nodeSpans.set(nodeId, {
          id: ref.idSpan,
          label: ref.labelSpan,
          decl: ref.declSpan,
          bracketed: ref.bracketed,
        });
      } else if (ref.explicit) {
        nodeMap.set(ref.id, { id: existing.id, label: ref.label, shape: ref.shape });
        nodeSpans.set(existing.id, {
          id: ref.idSpan,
          label: ref.labelSpan,
          decl: ref.declSpan,
          bracketed: ref.bracketed,
        });
      }
    }
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const from = refs[i];
      const to = refs[i + 1];
      if (link === undefined || from === undefined || to === undefined) {
        malformed = true;
        break;
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
      if (pipe !== undefined) edgeSpans.set(edgeId, trimmedSpan(pipe));
    }
    return refs.map((r) => r.id);
  };

  const offsetOf = (node: CstNode): number => node.location?.startOffset ?? 0;

  // Processes a container's statements and nested subgraphs **in source order** (so a node declared
  // inside a subgraph is claimed by it even if a later top-level edge mentions it). Returns the node
  // ids first claimed directly in this container.
  const processContainer = (children: Children, parentId: NodeId | null): readonly NodeId[] => {
    const members: NodeId[] = [];
    const ordered = [
      ...childNodes(children, "statement").map((n) => ({
        off: offsetOf(n),
        kind: "stmt",
        node: n,
      })),
      ...childNodes(children, "subgraphBlock").map((n) => ({
        off: offsetOf(n),
        kind: "sub",
        node: n,
      })),
    ].sort((a, b) => a.off - b.off);

    for (const item of ordered) {
      if (item.kind === "stmt") {
        for (const rid of processStatement(item.node)) {
          if (!claimed.has(rid)) {
            claimed.add(rid);
            members.push(brand<string, "NodeId">(rid));
          }
        }
      } else {
        const bc = item.node.children;
        const idImage = childTokens(bc, "Identifier")[0]?.image ?? "";
        const sgId = brand<string, "NodeId">(idImage);
        const inner = processContainer(bc, sgId);
        subgraphs.push({
          id: sgId,
          label: subgraphLabel(bc, idImage),
          parent: parentId,
          nodes: inner,
        });
      }
    }
    return members;
  };

  const topLevel = processContainer(root, null);
  if (malformed) return err(parseError(["internal: malformed edge chain"]));

  // Canonical node order = top-level nodes, then each subgraph's nodes depth-first — exactly how the
  // printer emits them, so print→parse is a fixed point regardless of the original source order.
  const orderedIds: NodeId[] = [...topLevel];
  const walk = (parentId: NodeId | null): void => {
    for (const s of subgraphs) {
      if (s.parent === parentId) {
        // A loop, not `push(...)`: a spread of a very large subgraph's nodes would exceed the
        // argument-count limit and throw.
        for (const n of s.nodes) orderedIds.push(n);
        walk(s.id);
      }
    }
  };
  walk(null);
  const nodes = orderedIds
    .map((id) => nodeMap.get(id))
    .filter((n): n is FlowNode => n !== undefined);

  const ast: FlowchartAst = { kind: "flowchart", direction, nodes, edges, subgraphs };
  return ok({ ast, source: { nodes: nodeSpans, edges: edgeSpans } });
};

export const parseWithSource = (text: string): Result<ParsedSource, ParseError> => {
  const lexed = lexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err(lexingError(lexed.errors));
  }
  flowchartParser.input = lexed.tokens;
  const cst = flowchartParser.flowchart();
  if (flowchartParser.errors.length > 0) {
    return err(recognitionError(flowchartParser.errors));
  }
  return buildResult(cst);
};

export const parse = (text: string): Result<FlowchartAst, ParseError> =>
  map(parseWithSource(text), (parsed) => parsed.ast);
