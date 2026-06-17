import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, map, ok, type Result } from "@m/std";
import type {
  EdgeId,
  EdgeKind,
  FlowDirection,
  FlowEdge,
  FlowNode,
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
      bracketed: false,
    };
  }

  const sc = shapeNode.children;
  const square = childTokens(sc, "SquareText")[0];
  if (square !== undefined) {
    return {
      id,
      label: square.image.trim(),
      shape: "rect",
      explicit: true,
      idSpan,
      labelSpan: spanOf(square),
      bracketed: true,
    };
  }
  const stadium = childTokens(sc, "StadiumText")[0];
  if (stadium !== undefined) {
    return {
      id,
      label: stadium.image.trim(),
      shape: "stadium",
      explicit: true,
      idSpan,
      labelSpan: spanOf(stadium),
      bracketed: true,
    };
  }
  const circle = childTokens(sc, "CircleText")[0];
  if (circle !== undefined) {
    return {
      id,
      label: circle.image.trim(),
      shape: "circle",
      explicit: true,
      idSpan,
      labelSpan: spanOf(circle),
      bracketed: true,
    };
  }
  const paren = childTokens(sc, "ParenText")[0];
  if (paren !== undefined) {
    return {
      id,
      label: paren.image.trim(),
      shape: "round",
      explicit: true,
      idSpan,
      labelSpan: spanOf(paren),
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
    bracketed: true,
  };
};

const linkKind = (c: Children): EdgeKind => {
  if (childTokens(c, "Arrow").length > 0) return "arrow";
  if (childTokens(c, "OpenLink").length > 0) return "open";
  if (childTokens(c, "DottedArrow").length > 0) return "dotted";
  return "thick";
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

  for (const stmt of childNodes(root, "statement")) {
    const refs = childNodes(stmt.children, "nodeRef").map(readNodeRef);
    const links = childNodes(stmt.children, "link");

    for (const ref of refs) {
      const existing = nodeMap.get(ref.id);
      if (existing === undefined) {
        const nodeId = brand<string, "NodeId">(ref.id);
        nodeMap.set(ref.id, { id: nodeId, label: ref.label, shape: ref.shape });
        nodeSpans.set(nodeId, { id: ref.idSpan, label: ref.labelSpan, bracketed: ref.bracketed });
      } else if (ref.explicit) {
        nodeMap.set(ref.id, { id: existing.id, label: ref.label, shape: ref.shape });
        nodeSpans.set(existing.id, {
          id: ref.idSpan,
          label: ref.labelSpan,
          bracketed: ref.bracketed,
        });
      }
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
      if (pipe !== undefined) edgeSpans.set(edgeId, trimmedSpan(pipe));
    }
  }

  const ast: FlowchartAst = { kind: "flowchart", direction, nodes: [...nodeMap.values()], edges };
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
