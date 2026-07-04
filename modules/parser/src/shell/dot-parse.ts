import type { CstNode, IToken } from "chevrotain";
import { childNodes, childTokens, spanOf } from "./cst.js";
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
import { lexingError, recognitionError } from "./parse-error.js";
import type { ParseError } from "./parse-error.js";
import { dotParser } from "./dot-grammar.js";
import { dotLexer } from "./dot-tokens.js";

// A DOT id is a bare identifier, a quoted string (unescaped), or a numeral.
const idText = (node: CstNode): string => {
  const bare = childTokens(node.children, "Id")[0];
  if (bare !== undefined) return bare.image;
  const quoted = childTokens(node.children, "QuotedString")[0];
  if (quoted !== undefined) return quoted.image.slice(1, -1).replace(/\\(["\\])/g, "$1");
  const num = childTokens(node.children, "NumberLit")[0];
  return num === undefined ? "" : num.image;
};

// Extracts the token representing the ID (to get its precise source range).
const idToken = (idNode: CstNode): IToken | undefined => {
  const c = idNode.children;
  return (
    childTokens(c, "Id")[0] ?? childTokens(c, "QuotedString")[0] ?? childTokens(c, "NumberLit")[0]
  );
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

const nodeShapeOf = (attrs: ReadonlyMap<string, string>, fallback: NodeShape): NodeShape => {
  const base = shapeOf(attrs.get("shape")) ?? fallback;
  const style = attrs.get("style")?.toLowerCase() ?? "";
  return (base === "rect" || base === "round" || base === "stadium") && style.includes("rounded")
    ? "round"
    : base;
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

const findAttrValueToken = (attrList: CstNode | undefined, name: string): IToken | null => {
  if (attrList === undefined) return null;
  for (const item of childNodes(attrList.children, "aItem")) {
    const ids = childNodes(item.children, "id");
    const key = ids[0];
    const value = ids[1];
    if (key !== undefined && value !== undefined && idText(key).toLowerCase() === name) {
      const tok = idToken(value);
      if (tok !== undefined) return tok;
    }
  }
  return null;
};

const innerSpan = (t: IToken): TextSpan => ({
  start: t.startOffset + 1,
  end: t.startOffset + t.image.length - 1,
});

const cstSpan = (node: CstNode): TextSpan => {
  let minStart = Infinity;
  let maxEnd = -Infinity;
  const traverse = (n: CstNode | IToken) => {
    if ("image" in n) {
      minStart = Math.min(minStart, n.startOffset);
      maxEnd = Math.max(maxEnd, n.startOffset + n.image.length);
    } else if (n.children) {
      for (const key in n.children) {
        const list = n.children[key];
        if (list) {
          for (const child of list) {
            traverse(child);
          }
        }
      }
    }
  };
  traverse(node);
  return { start: minStart === Infinity ? 0 : minStart, end: maxEnd === -Infinity ? 0 : maxEnd };
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

const buildResultWithSource = (
  cst: CstNode,
): Result<{ readonly ast: FlowchartAst; readonly source: SourceMap }, ParseError> => {
  const directed = childTokens(cst.children, "Digraph").length > 0;
  let direction: FlowDirection = "TB";
  let defaultShape: NodeShape = "round";
  const nodes = new Map<string, NodeData>();
  const edges: FlowEdge[] = [];
  const clusters: ClusterRec[] = [];
  let anon = 0;

  const nodeSpans = new Map<NodeId, NodeSpans>();
  const edgeSpans = new Map<EdgeId, TextSpan>();
  const arrowSpans = new Map<EdgeId, TextSpan>();

  // First sighting of a node fixes its cluster membership (DOT scoping); later references don't move it.
  const ensureNode = (id: string, cluster: ClusterRec | null, idTok?: IToken): void => {
    if (nodes.has(id)) return;
    nodes.set(id, { label: id, shape: defaultShape });
    if (cluster !== null) cluster.nodes.push(id);

    const nodeId = brand<string, "NodeId">(id);
    const fallbackSpan = idTok !== undefined ? spanOf(idTok) : { start: 0, end: 0 };
    nodeSpans.set(nodeId, {
      id: fallbackSpan,
      label: fallbackSpan,
      decl: fallbackSpan,
      bracketed: false,
    });
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
          defaultShape = nodeShapeOf(attrs, defaultShape);
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
      const headTok = idToken(head);
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
        const idsInRHS = childNodes(edgeRHS.children, "id");
        const chain = [headText, ...idsInRHS.map(idText)];
        const chainToks = [headTok, ...idsInRHS.map(idToken)].filter(
          (t): t is IToken => t !== undefined,
        );
        for (let idx = 0; idx < chain.length; idx++) {
          const item = chain[idx];
          const t = chainToks[idx];
          if (item !== undefined) ensureNode(item, cluster, t);
        }

        const kind = edgeKindOf(attrs, directed);
        const label = attrs.get("label") ?? null;

        const opTokens = [
          ...(childTokens(edgeRHS.children, "Arrow") ?? []),
          ...(childTokens(edgeRHS.children, "DashDash") ?? []),
        ].sort((a, b) => a.startOffset - b.startOffset);

        for (let i = 0; i + 1 < chain.length; i++) {
          const from = chain[i];
          const to = chain[i + 1];
          if (from === undefined || to === undefined) continue;
          const edgeId = brand<string, "EdgeId">(`e${edges.length}`);
          edges.push({
            id: edgeId,
            from: brand<string, "NodeId">(from),
            to: brand<string, "NodeId">(to),
            kind,
            label,
          });

          const arrowTok = opTokens[i];
          if (arrowTok !== undefined) {
            arrowSpans.set(edgeId, spanOf(arrowTok));
          }

          const labelTok = findAttrValueToken(childNodes(idStmt.children, "attrList")[0], "label");
          if (labelTok !== null) {
            const labelSpan = labelTok.image.startsWith('"')
              ? innerSpan(labelTok)
              : spanOf(labelTok);
            edgeSpans.set(edgeId, labelSpan);
          }
        }
        continue;
      }

      // A node statement: create it (if new) and apply any explicit label/shape.
      ensureNode(headText, cluster, headTok);
      const data = nodes.get(headText);
      if (data !== undefined) {
        data.label = attrs.get("label") ?? data.label;
        data.shape = nodeShapeOf(attrs, data.shape);

        const nodeId = brand<string, "NodeId">(headText);
        const labelTok = findAttrValueToken(childNodes(idStmt.children, "attrList")[0], "label");
        const idSpan = headTok !== undefined ? spanOf(headTok) : { start: 0, end: 0 };
        const labelSpan =
          labelTok === null
            ? idSpan
            : labelTok.image.startsWith('"')
              ? innerSpan(labelTok)
              : spanOf(labelTok);
        const declSpan = cstSpan(stmt);
        const bracketed = childNodes(idStmt.children, "attrList")[0] !== undefined;

        nodeSpans.set(nodeId, {
          id: idSpan,
          label: labelSpan,
          decl: declSpan,
          bracketed,
        });
      }
    }
  };

  walk(childNodes(cst.children, "stmt"), null);

  const flowNodes: FlowNode[] = [...nodes.entries()].map(([id, n]) => ({
    id: brand<string, "NodeId">(id),
    label: n.label,
    shape: n.shape,
    icon: null,
  }));
  const subgraphs: FlowSubgraph[] = clusters.map((c) => ({
    id: brand<string, "NodeId">(c.id),
    label: c.label === "" ? c.id : c.label,
    parent: c.parent === null ? null : brand<string, "NodeId">(c.parent),
    nodes: c.nodes.map((n) => brand<string, "NodeId">(n)),
  }));

  return ok({
    // DOT has no Mermaid `style`/`classDef` syntax, so an imported graph carries no styling directives.
    ast: { kind: "flowchart", direction, nodes: flowNodes, edges, subgraphs, styles: [] },
    // DOT has no Mermaid `style` directives, so there are no editable style-line spans.
    source: { nodes: nodeSpans, edges: edgeSpans, arrows: arrowSpans, styleSpans: new Map() },
  });
};

export const parseDotWithSource = (
  text: string,
): Result<{ readonly ast: FlowchartAst; readonly source: SourceMap }, ParseError> => {
  const lexed = dotLexer.tokenize(text);
  if (lexed.errors.length > 0) {
    return err(lexingError(lexed.errors));
  }
  dotParser.input = lexed.tokens;
  const cst = dotParser.dot();
  if (dotParser.errors.length > 0) {
    return err(recognitionError(dotParser.errors));
  }
  return buildResultWithSource(cst);
};

// Imports a Graphviz DOT graph as a flowchart AST, so it renders + lays out through the existing
// flowchart pipeline. A subset: `cluster*` subgraphs become flowchart subgraphs (boxes); ports and
// HTML labels are unsupported (and a non-`cluster` subgraph is transparent — layout grouping only).
export const parseDot = (text: string): Result<FlowchartAst, ParseError> =>
  map(parseDotWithSource(text), (parsed) => parsed.ast);
