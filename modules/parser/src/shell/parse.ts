import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, ok, type Result } from "@m/std";
import type {
  EdgeKind,
  FlowDirection,
  FlowEdge,
  FlowNode,
  FlowchartAst,
  NodeShape,
} from "@m/contracts";
import { flowchartParser } from "./grammar.js";
import { lexer } from "./tokens.js";

export interface ParseError {
  readonly kind: "parse";
  readonly errors: readonly string[];
}

type Children = Record<string, CstElement[] | undefined>;

const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];
const imageOf = (c: Children, name: string): string | null =>
  childTokens(c, name)[0]?.image ?? null;

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
}

const readNodeRef = (node: CstNode): Ref => {
  const c = node.children;
  const id = imageOf(c, "Identifier") ?? "";
  const shapeNode = childNodes(c, "shape")[0];
  if (shapeNode === undefined) return { id, label: id, shape: "rect", explicit: false };
  const sc = shapeNode.children;
  const square = imageOf(sc, "SquareText");
  if (square !== null) return { id, label: square.trim(), shape: "rect", explicit: true };
  const paren = imageOf(sc, "ParenText");
  if (paren !== null) return { id, label: paren.trim(), shape: "round", explicit: true };
  return { id, label: (imageOf(sc, "CurlyText") ?? "").trim(), shape: "diamond", explicit: true };
};

const linkKind = (c: Children): EdgeKind => {
  if (childTokens(c, "Arrow").length > 0) return "arrow";
  if (childTokens(c, "OpenLink").length > 0) return "open";
  if (childTokens(c, "DottedArrow").length > 0) return "dotted";
  return "thick";
};

const buildAst = (cst: CstNode): Result<FlowchartAst, ParseError> => {
  const root = cst.children;
  const headerNode = childNodes(root, "header")[0];
  const dirRaw = headerNode === undefined ? null : imageOf(headerNode.children, "Identifier");
  const direction = toDirection(dirRaw);
  if (direction === null) {
    return err({ kind: "parse", errors: [`invalid flowchart direction: ${dirRaw ?? ""}`] });
  }

  const nodeMap = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];

  for (const stmt of childNodes(root, "statement")) {
    const refs = childNodes(stmt.children, "nodeRef").map(readNodeRef);
    const links = childNodes(stmt.children, "link");

    for (const ref of refs) {
      const existing = nodeMap.get(ref.id);
      if (existing === undefined) {
        nodeMap.set(ref.id, {
          id: brand<string, "NodeId">(ref.id),
          label: ref.label,
          shape: ref.shape,
        });
      } else if (ref.explicit) {
        nodeMap.set(ref.id, { id: existing.id, label: ref.label, shape: ref.shape });
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

  return ok({ kind: "flowchart", direction, nodes: [...nodeMap.values()], edges });
};

export const parse = (text: string): Result<FlowchartAst, ParseError> => {
  const lexed = lexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err({ kind: "parse", errors: lexed.errors.map((e) => e.message) });
  }
  flowchartParser.input = lexed.tokens;
  const cst = flowchartParser.flowchart();
  if (flowchartParser.errors.length > 0) {
    return err({ kind: "parse", errors: flowchartParser.errors.map((e) => e.message) });
  }
  return buildAst(cst);
};
