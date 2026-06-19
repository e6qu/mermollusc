import { brand, err, ok, point, rect, type Point, type Result } from "@m/std";
import type {
  EdgeEnd,
  EdgeId,
  EdgeKind,
  EdgeStroke,
  FlowDirection,
  FlowEdge,
  FlowNode,
  FlowSubgraph,
  FlowchartAst,
  NodeId,
  Scene,
  SceneEdge,
  SceneNode,
} from "@m/contracts";
import type {
  ContainerNode,
  LayoutConfig,
  LayoutError,
  LayoutGraph,
  LeafNode,
  MeasureText,
  PositionedGraph,
} from "./graph.js";

const EDGE_STYLE: Record<EdgeKind, { readonly stroke: EdgeStroke; readonly toEnd: EdgeEnd }> = {
  arrow: { stroke: "solid", toEnd: "arrow" },
  open: { stroke: "solid", toEnd: "none" },
  dotted: { stroke: "dashed", toEnd: "arrow" },
  thick: { stroke: "solid", toEnd: "arrow" },
};

const ELK_DIRECTION: Record<FlowDirection, LayoutConfig["direction"]> = {
  TB: "DOWN",
  BT: "UP",
  LR: "RIGHT",
  RL: "LEFT",
};

const LABEL_PADDING = 24;
const NODE_HEIGHT = 40;
const MIN_NODE_WIDTH = 48;
const NODE_SPACING = 40;

const nodeWidth = (label: string, measure: MeasureText): number =>
  Math.max(MIN_NODE_WIDTH, measure(label) + LABEL_PADDING);

// A non-empty `seed` (node → current position) switches ELK into semi-interactive layered layout:
// it relaxes the graph around the given coordinates instead of laying out from scratch (an empty
// map means a clean layout). `measure` sizes node labels. Both are explicit — no defaults — so the
// caller always states its intent (clean vs relax, which measurer).
export const toElkGraph = (
  ast: FlowchartAst,
  seed: ReadonlyMap<NodeId, Point>,
  measure: MeasureText,
): LayoutGraph => {
  const nodeById = new Map<NodeId, FlowNode>(ast.nodes.map((n) => [n.id, n]));

  const leaf = (n: FlowNode): LeafNode => {
    const at = seed.get(n.id);
    const width = nodeWidth(n.label, measure);
    // A circle must be square to actually render as a circle (the renderer rounds corners by
    // min(w,h)/2); size it to the larger of the label width and the standard node height.
    const side = Math.max(width, NODE_HEIGHT);
    return {
      kind: "leaf",
      id: n.id,
      width: n.shape === "circle" ? side : width,
      height: n.shape === "circle" ? side : NODE_HEIGHT,
      position: at === undefined ? null : { x: at.x, y: at.y },
    };
  };

  // A subgraph becomes a container whose children are its member leaves plus nested subgraph
  // containers; ELK sizes it to fit them.
  const container = (sg: FlowSubgraph): ContainerNode => ({
    kind: "container",
    id: sg.id,
    children: [
      ...sg.nodes.flatMap((id) => {
        const n = nodeById.get(id);
        return n === undefined ? [] : [leaf(n)];
      }),
      ...ast.subgraphs.filter((s) => s.parent === sg.id).map(container),
    ],
  });

  const memberIds = new Set<NodeId>(ast.subgraphs.flatMap((s) => [...s.nodes]));
  return {
    id: "root",
    config: {
      direction: ELK_DIRECTION[ast.direction],
      interactive: seed.size > 0,
      nodeSpacing: NODE_SPACING,
      layerSpacing: NODE_SPACING,
    },
    children: [
      ...ast.nodes.filter((n) => !memberIds.has(n.id)).map(leaf),
      ...ast.subgraphs.filter((s) => s.parent === null).map(container),
    ],
    edges: ast.edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };
};

export const toScene = (
  positioned: PositionedGraph,
  ast: FlowchartAst,
): Result<Scene, LayoutError> => {
  const nodeById = new Map<NodeId, FlowNode>(ast.nodes.map((n) => [n.id, n]));
  const edgeById = new Map<EdgeId, FlowEdge>(ast.edges.map((e) => [e.id, e]));
  const subgraphById = new Map<NodeId, FlowSubgraph>(ast.subgraphs.map((s) => [s.id, s]));

  const nodes: SceneNode[] = [];
  for (const pn of positioned.nodes) {
    const parent = pn.parent === null ? null : brand<string, "SceneNodeId">(pn.parent);
    const sub = subgraphById.get(pn.id);
    if (sub !== undefined) {
      // A subgraph container: drawn as an outlined box with its title near the top.
      nodes.push({
        id: brand<string, "SceneNodeId">(pn.id),
        bounds: rect(pn.x, pn.y, pn.width, pn.height),
        label: sub.label,
        shape: "container",
        parent,
        icon: null,
        rows: null,
        rowDivider: null,
        subtitle: null,
      });
      continue;
    }
    const fn = nodeById.get(pn.id);
    if (fn === undefined) return err({ kind: "layout", message: `node ${pn.id} missing from AST` });
    nodes.push({
      id: brand<string, "SceneNodeId">(pn.id),
      bounds: rect(pn.x, pn.y, pn.width, pn.height),
      label: fn.label,
      shape: fn.shape,
      parent,
      icon: null,
      rows: null,
      rowDivider: null,
      subtitle: null,
    });
  }

  const edges: SceneEdge[] = [];
  for (const pe of positioned.edges) {
    const astEdge = edgeById.get(pe.id);
    if (astEdge === undefined)
      return err({ kind: "layout", message: `edge ${pe.id} missing from AST` });
    edges.push({
      id: brand<string, "SceneEdgeId">(pe.id),
      from: brand<string, "SceneNodeId">(astEdge.from),
      to: brand<string, "SceneNodeId">(astEdge.to),
      waypoints: pe.points.map((p) => point(p.x, p.y)),
      label: astEdge.label,
      fromEnd: "none",
      ...EDGE_STYLE[astEdge.kind],
    });
  }

  return ok({ nodes, edges, wedges: [], extent: rect(0, 0, positioned.width, positioned.height) });
};
