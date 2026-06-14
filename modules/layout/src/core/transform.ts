import { brand, err, ok, point, rect, type Result } from "@m/std";
import type {
  FlowDirection,
  FlowEdge,
  FlowchartAst,
  Scene,
  SceneEdge,
  SceneNode,
} from "@m/contracts";
import type { LayoutError, LayoutGraph, PositionedGraph } from "./graph.js";

const ELK_DIRECTION: Record<FlowDirection, string> = {
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

const nodeWidth = (label: string): number =>
  Math.max(MIN_NODE_WIDTH, label.length * CHAR_WIDTH + LABEL_PADDING);

export const toElkGraph = (ast: FlowchartAst): LayoutGraph => ({
  id: "root",
  layoutOptions: {
    "elk.algorithm": "layered",
    "elk.direction": ELK_DIRECTION[ast.direction],
    "elk.spacing.nodeNode": "40",
    "elk.layered.spacing.nodeNodeBetweenLayers": "40",
  },
  children: ast.nodes.map((n) => ({ id: n.id, width: nodeWidth(n.label), height: NODE_HEIGHT })),
  edges: ast.edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
});

export const toScene = (
  positioned: PositionedGraph,
  ast: FlowchartAst,
): Result<Scene, LayoutError> => {
  const labelById = new Map<string, string>(ast.nodes.map((n) => [n.id, n.label]));
  const edgeById = new Map<string, FlowEdge>(ast.edges.map((e) => [e.id, e]));

  const nodes: SceneNode[] = [];
  for (const pn of positioned.nodes) {
    const label = labelById.get(pn.id);
    if (label === undefined)
      return err({ kind: "layout", message: `node ${pn.id} missing from AST` });
    nodes.push({
      id: brand<string, "SceneNodeId">(pn.id),
      bounds: rect(pn.x, pn.y, pn.width, pn.height),
      label,
      parent: null,
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
    });
  }

  return ok({ nodes, edges, extent: rect(0, 0, positioned.width, positioned.height) });
};
