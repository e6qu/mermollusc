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
import { lexingError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { dotParser } from "./dot-grammar.js";
import { dotLexer } from "./dot-tokens.js";

type Children = Record<string, CstElement[] | undefined>;
const childTokens = (c: Children, name: string): IToken[] => (c[name] ?? []) as IToken[];
const childNodes = (c: Children, name: string): CstNode[] => (c[name] ?? []) as CstNode[];

// A DOT id is a bare identifier, a quoted string (unescaped), or a numeral.
const idText = (node: CstNode): string => {
  const bare = childTokens(node.children, "Id")[0];
  if (bare !== undefined) return bare.image;
  const quoted = childTokens(node.children, "QuotedString")[0];
  if (quoted !== undefined) return quoted.image.slice(1, -1).replace(/\\(["\\])/g, "$1");
  const num = childTokens(node.children, "NumberLit")[0];
  return num === undefined ? "" : num.image;
};

// A DOT shape name → the nearest SceneGraph shape; null when unknown (keep the running default).
const shapeOf = (value: string | undefined): NodeShape | null => {
  if (value === undefined) return null;
  switch (value.toLowerCase()) {
    case "box":
    case "rect":
    case "rectangle":
    case "square":
      return "rect";
    case "circle":
    case "doublecircle":
      return "circle";
    case "diamond":
    case "mdiamond":
      return "diamond";
    case "ellipse":
    case "oval":
      return "round";
    default:
      return null;
  }
};

const dirOf = (value: string): FlowDirection | null => {
  switch (value.toUpperCase()) {
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

// Collapses an `attr_list`'s `name=value` items into a lookup (later wins), keys lower-cased so the
// known attributes (`label`/`shape`/`style`/`rankdir`) match regardless of how they were cased.
const attrsOf = (attrList: CstNode | undefined): ReadonlyMap<string, string> => {
  const out = new Map<string, string>();
  if (attrList === undefined) return out;
  for (const item of childNodes(attrList.children, "aItem")) {
    const ids = childNodes(item.children, "id");
    const key = ids[0];
    const value = ids[1];
    if (key !== undefined && value !== undefined) out.set(idText(key).toLowerCase(), idText(value));
  }
  return out;
};

const edgeKindOf = (attrs: ReadonlyMap<string, string>, directed: boolean): EdgeKind => {
  const style = attrs.get("style");
  if (style === "dashed" || style === "dotted") return directed ? "dotted" : "open";
  if (style === "bold") return "thick";
  return directed ? "arrow" : "open";
};

interface NodeData {
  label: string;
  shape: NodeShape;
}

const buildResult = (cst: CstNode): Result<FlowchartAst, ParseError> => {
  const root = cst.children;
  const directed = childTokens(root, "Digraph").length > 0;
  let direction: FlowDirection = "TB";
  let defaultShape: NodeShape = "round";
  const nodes = new Map<string, NodeData>();
  const edges: FlowEdge[] = [];

  const ensureNode = (id: string): void => {
    if (!nodes.has(id)) nodes.set(id, { label: id, shape: defaultShape });
  };

  for (const stmt of childNodes(root, "stmt")) {
    const attrStmt = childNodes(stmt.children, "attrStmt")[0];
    if (attrStmt !== undefined) {
      const attrs = attrsOf(childNodes(attrStmt.children, "attrList")[0]);
      if (childTokens(attrStmt.children, "NodeKw").length > 0) {
        defaultShape = shapeOf(attrs.get("shape")) ?? defaultShape;
      } else if (childTokens(attrStmt.children, "Graph").length > 0) {
        const rd = attrs.get("rankdir");
        if (rd !== undefined) direction = dirOf(rd) ?? direction;
      }
      continue;
    }

    const idStmt = childNodes(stmt.children, "idStmt")[0];
    if (idStmt === undefined) continue;
    const ids = childNodes(idStmt.children, "id");
    const head = ids[0];
    if (head === undefined) continue;
    const headText = idText(head);
    const hasEq = childTokens(idStmt.children, "Eq").length > 0;
    const edgeRHS = childNodes(idStmt.children, "edgeRHS")[0];
    const attrs = attrsOf(childNodes(idStmt.children, "attrList")[0]);

    if (hasEq) {
      // A top-level `name = value` graph attribute (e.g. `rankdir=LR`); only direction is honoured.
      const value = ids[1];
      if (headText.toLowerCase() === "rankdir" && value !== undefined) {
        direction = dirOf(idText(value)) ?? direction;
      }
      continue;
    }

    if (edgeRHS !== undefined) {
      const chain = [headText, ...childNodes(edgeRHS.children, "id").map(idText)];
      for (const id of chain) ensureNode(id);
      const kind = edgeKindOf(attrs, directed);
      const label = attrs.get("label") ?? null;
      for (let i = 0; i + 1 < chain.length; i++) {
        const from = chain[i];
        const to = chain[i + 1];
        if (from === undefined || to === undefined) continue;
        edges.push({
          id: brand<string, "EdgeId">(`e${edges.length}`),
          from: brand<string, "NodeId">(from),
          to: brand<string, "NodeId">(to),
          kind,
          label,
        });
      }
      continue;
    }

    // A node statement: create it (if new) and apply any explicit label/shape.
    ensureNode(headText);
    const data = nodes.get(headText);
    if (data !== undefined) {
      data.label = attrs.get("label") ?? data.label;
      data.shape = shapeOf(attrs.get("shape")) ?? data.shape;
    }
  }

  const flowNodes: FlowNode[] = [...nodes.entries()].map(([id, n]) => ({
    id: brand<string, "NodeId">(id),
    label: n.label,
    shape: n.shape,
  }));

  return ok({ kind: "flowchart", direction, nodes: flowNodes, edges, subgraphs: [] });
};

// Imports a Graphviz DOT graph as a flowchart AST, so it renders + lays out through the existing
// flowchart pipeline. A subset: subgraphs/clusters, ports, and HTML labels are unsupported (loud).
export const parseDot = (text: string): Result<FlowchartAst, ParseError> => {
  const lexed = dotLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err(lexingError(lexed.errors));
  }
  dotParser.input = lexed.tokens;
  const cst = dotParser.dot();
  if (dotParser.errors.length > 0) {
    return err(recognitionError(dotParser.errors));
  }
  return buildResult(cst);
};
