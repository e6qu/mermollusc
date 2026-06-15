import { brand, err, ok, point, rect, type Point, type Result } from "@m/std";
import type {
  EdgeArrow,
  EdgeKind,
  EdgeStroke,
  FlowDirection,
  FlowEdge,
  FlowNode,
  FlowchartAst,
  NodeId,
  Scene,
  SceneEdge,
  SceneNode,
} from "@m/contracts";

const EDGE_STYLE: Record<EdgeKind, { readonly stroke: EdgeStroke; readonly arrow: EdgeArrow }> = {
  arrow: { stroke: "solid", arrow: "filled" },
  open: { stroke: "solid", arrow: "none" },
  dotted: { stroke: "dashed", arrow: "filled" },
  thick: { stroke: "solid", arrow: "filled" },
};
import type { LayoutConfig, LayoutError, LayoutGraph, PositionedGraph } from "./graph.js";

const ELK_DIRECTION: Record<FlowDirection, LayoutConfig["direction"]> = {
  TB: "DOWN",
  BT: "UP",
  LR: "RIGHT",
  RL: "LEFT",
};

// Node sizing is a coarse heuristic until the renderer can measure text.
const CHAR_WIDTH = 8;
const LABEL_PADDING = 24;
const NODE_HEIGHT = 40;
const MIN_NODE_WIDTH = 48;
const NODE_SPACING = 40;

const nodeWidth = (label: string): number =>
  Math.max(MIN_NODE_WIDTH, label.length * CHAR_WIDTH + LABEL_PADDING);

// A non-empty `seed` (node → current position) switches ELK into semi-interactive layered
// layout: it relaxes the graph around the given coordinates instead of laying out from scratch.
export const toElkGraph = (
  ast: FlowchartAst,
  seed: ReadonlyMap<NodeId, Point> = new Map(),
): LayoutGraph => ({
  id: "root",
  config: {
    direction: ELK_DIRECTION[ast.direction],
    interactive: seed.size > 0,
    nodeSpacing: NODE_SPACING,
    layerSpacing: NODE_SPACING,
  },
  children: ast.nodes.map((n) => {
    const at = seed.get(n.id);
    return {
      id: n.id,
      width: nodeWidth(n.label),
      height: NODE_HEIGHT,
      position: at === undefined ? null : { x: at.x, y: at.y },
    };
  }),
  edges: ast.edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
});

export const toScene = (
  positioned: PositionedGraph,
  ast: FlowchartAst,
): Result<Scene, LayoutError> => {
  const nodeById = new Map<string, FlowNode>(ast.nodes.map((n) => [n.id, n]));
  const edgeById = new Map<string, FlowEdge>(ast.edges.map((e) => [e.id, e]));

  const nodes: SceneNode[] = [];
  for (const pn of positioned.nodes) {
    const fn = nodeById.get(pn.id);
    if (fn === undefined) return err({ kind: "layout", message: `node ${pn.id} missing from AST` });
    nodes.push({
      id: brand<string, "SceneNodeId">(pn.id),
      bounds: rect(pn.x, pn.y, pn.width, pn.height),
      label: fn.label,
      shape: fn.shape,
      parent: null,
      icon: null,
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
      ...EDGE_STYLE[astEdge.kind],
    });
  }

  return ok({ nodes, edges, extent: rect(0, 0, positioned.width, positioned.height) });
};
