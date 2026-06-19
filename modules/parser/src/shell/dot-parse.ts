import type { CstElement, CstNode, IToken } from "chevrotain";
import { brand, err, ok, type Result } from "@m/std";
import type {
  EdgeKind,
  FlowDirection,
  FlowEdge,
  FlowNode,
  FlowSubgraph,
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
  const style = attrs.get("style")?.toLowerCase();
  if (style === "dashed" || style === "dotted") return directed ? "dotted" : "open";
  if (style === "bold") return "thick";
  return directed ? "arrow" : "open";
};

interface NodeData {
  label: string;
  shape: NodeShape;
}

// A `cluster*` subgraph being assembled into a `FlowSubgraph` (label/membership filled as we walk).
interface ClusterRec {
  readonly id: string;
  label: string;
  readonly parent: string | null;
  readonly nodes: string[];
}

const buildResult = (cst: CstNode): Result<FlowchartAst, ParseError> => {
  const directed = childTokens(cst.children, "Digraph").length > 0;
  let direction: FlowDirection = "TB";
  let defaultShape: NodeShape = "round";
  const nodes = new Map<string, NodeData>();
  const edges: FlowEdge[] = [];
  const clusters: ClusterRec[] = [];
  let anon = 0;

  // First sighting of a node fixes its cluster membership (DOT scoping); later references don't move it.
  const ensureNode = (id: string, cluster: ClusterRec | null): void => {
    if (nodes.has(id)) return;
    nodes.set(id, { label: id, shape: defaultShape });
    if (cluster !== null) cluster.nodes.push(id);
  };

  // Walks a statement list within an enclosing cluster (null at the top level), recursing into nested
  // subgraphs. Graphviz only boxes `cluster`-prefixed subgraphs; others are transparent (their nodes
  // belong to the enclosing cluster, matching how the layout would group them).
  const walk = (stmts: readonly CstNode[], cluster: ClusterRec | null): void => {
    for (const stmt of stmts) {
      const sub = childNodes(stmt.children, "subgraphStmt")[0];
      if (sub !== undefined) {
        const idNode = childNodes(sub.children, "id")[0];
        const sgId = idNode === undefined ? `__anon${anon++}` : idText(idNode);
        const inner = childNodes(sub.children, "stmt");
        if (sgId.toLowerCase().startsWith("cluster")) {
          const rec: ClusterRec = {
            id: sgId,
            label: "",
            parent: cluster === null ? null : cluster.id,
            nodes: [],
          };
          clusters.push(rec);
          walk(inner, rec);
        } else {
          walk(inner, cluster);
        }
        continue;
      }

      const attrStmt = childNodes(stmt.children, "attrStmt")[0];
      if (attrStmt !== undefined) {
        const attrs = attrsOf(childNodes(attrStmt.children, "attrList")[0]);
        if (childTokens(attrStmt.children, "NodeKw").length > 0) {
          defaultShape = shapeOf(attrs.get("shape")) ?? defaultShape;
        } else if (childTokens(attrStmt.children, "Graph").length > 0) {
          const rd = attrs.get("rankdir");
          if (rd !== undefined) direction = dirOf(rd) ?? direction;
          const lbl = attrs.get("label");
          if (lbl !== undefined && cluster !== null) cluster.label = lbl;
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
        // `name = value`: `rankdir` sets the flow direction; `label` inside a cluster names it.
        const value = ids[1];
        const key = headText.toLowerCase();
        if (key === "rankdir" && value !== undefined) {
          direction = dirOf(idText(value)) ?? direction;
        } else if (key === "label" && value !== undefined && cluster !== null) {
          cluster.label = idText(value);
        }
        continue;
      }

      if (edgeRHS !== undefined) {
        const chain = [headText, ...childNodes(edgeRHS.children, "id").map(idText)];
        for (const id of chain) ensureNode(id, cluster);
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
      ensureNode(headText, cluster);
      const data = nodes.get(headText);
      if (data !== undefined) {
        data.label = attrs.get("label") ?? data.label;
        data.shape = shapeOf(attrs.get("shape")) ?? data.shape;
      }
    }
  };

  walk(childNodes(cst.children, "stmt"), null);

  const flowNodes: FlowNode[] = [...nodes.entries()].map(([id, n]) => ({
    id: brand<string, "NodeId">(id),
    label: n.label,
    shape: n.shape,
  }));
  const subgraphs: FlowSubgraph[] = clusters.map((c) => ({
    id: brand<string, "NodeId">(c.id),
    label: c.label === "" ? c.id : c.label,
    parent: c.parent === null ? null : brand<string, "NodeId">(c.parent),
    nodes: c.nodes.map((n) => brand<string, "NodeId">(n)),
  }));

  return ok({ kind: "flowchart", direction, nodes: flowNodes, edges, subgraphs });
};

// Imports a Graphviz DOT graph as a flowchart AST, so it renders + lays out through the existing
// flowchart pipeline. A subset: `cluster*` subgraphs become flowchart subgraphs (boxes); ports and
// HTML labels are unsupported (and a non-`cluster` subgraph is transparent — layout grouping only).
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
