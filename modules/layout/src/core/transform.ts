import { err, ok, point, rect, type Point, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
import { boxCenter, routeWaypoints } from "./route.js";
import { clampedWidth } from "./measure.js";
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
// Box reserved for an edge's midpoint label so ELK routes around it (a little padding past the measured
// text; the height covers one line plus the renderer's label plate).
const EDGE_LABEL_PAD = 10;
const EDGE_LABEL_HEIGHT = 18;

const nodeWidth = (label: string, measure: MeasureText): number =>
  clampedWidth(label, measure, MIN_NODE_WIDTH, LABEL_PADDING);

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

  // Index subgraphs by parent once, so building the nesting tree is linear rather than re-filtering
  // the whole subgraph list at every level (the parent key is null at the top, or an enclosing id).
  const childSubgraphs = new Map<NodeId | null, FlowSubgraph[]>();
  for (const s of ast.subgraphs) {
    const siblings = childSubgraphs.get(s.parent);
    if (siblings === undefined) childSubgraphs.set(s.parent, [s]);
    else siblings.push(s);
  }

  // A subgraph becomes a container whose children are its member leaves plus nested subgraph
  // containers; ELK sizes it to fit them. The on-path guard mirrors the parser's: two `subgraph X`
  // blocks sharing an id, one nested in the other, would make `childSubgraphs.get("X")` contain a
  // subgraph keyed back to "X" and recurse forever — skip an id already on the path so it stays total.
  const onPath = new Set<NodeId>();
  const container = (sg: FlowSubgraph): ContainerNode => {
    onPath.add(sg.id);
    const nested = (childSubgraphs.get(sg.id) ?? [])
      .filter((c) => !onPath.has(c.id))
      .map(container);
    onPath.delete(sg.id);
    return {
      kind: "container",
      id: sg.id,
      children: [
        ...sg.nodes.flatMap((id) => {
          const n = nodeById.get(id);
          return n === undefined ? [] : [leaf(n)];
        }),
        ...nested,
      ],
    };
  };

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
      ...(childSubgraphs.get(null) ?? []).map(container),
    ],
    edges: ast.edges.map((e) => ({
      id: e.id,
      sources: [e.from],
      targets: [e.to],
      label:
        e.label === null
          ? null
          : { width: measure(e.label) + EDGE_LABEL_PAD, height: EDGE_LABEL_HEIGHT },
    })),
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
    const parent = pn.parent === null ? null : sceneNodeId(pn.parent);
    const sub = subgraphById.get(pn.id);
    if (sub !== undefined) {
      // A subgraph container: drawn as an outlined box with its title near the top.
      nodes.push({
        id: sceneNodeId(pn.id),
        bounds: rect(pn.x, pn.y, pn.width, pn.height),
        label: sub.label,
        shape: "container",
        parent,
        icon: null,
        rows: null,
        rowDivider: null,
        subtitle: null,
        accent: "none",
        role: "normal",
      });
      continue;
    }
    const fn = nodeById.get(pn.id);
    if (fn === undefined) return err({ kind: "layout", message: `node ${pn.id} missing from AST` });
    nodes.push({
      id: sceneNodeId(pn.id),
      bounds: rect(pn.x, pn.y, pn.width, pn.height),
      label: fn.label,
      shape: fn.shape,
      parent,
      icon: fn.icon,
      rows: null,
      rowDivider: null,
      subtitle: null,
      accent: "none",
      role: "normal",
    });
  }

  const centerById = new Map<string, Point>(
    nodes.map((n) => [
      n.id,
      boxCenter(n.bounds.origin.x, n.bounds.origin.y, n.bounds.size.width, n.bounds.size.height),
    ]),
  );

  const edges: SceneEdge[] = [];
  for (const pe of positioned.edges) {
    const astEdge = edgeById.get(pe.id);
    if (astEdge === undefined)
      return err({ kind: "layout", message: `edge ${pe.id} missing from AST` });
    const fromId = sceneNodeId(astEdge.from);
    const toId = sceneNodeId(astEdge.to);
    const fromCenter = centerById.get(fromId);
    const toCenter = centerById.get(toId);
    if (fromCenter === undefined || toCenter === undefined)
      return err({ kind: "layout", message: `edge ${pe.id} references an unpositioned node` });
    edges.push({
      id: sceneEdgeId(pe.id),
      from: fromId,
      to: toId,
      waypoints: routeWaypoints(pe.points, fromCenter, toCenter),
      label: astEdge.label,
      fromEnd: "none",
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos: pe.labelPos === null ? null : point(pe.labelPos.x, pe.labelPos.y),
      ...EDGE_STYLE[astEdge.kind],
    });
  }

  return ok({
    nodes,
    edges,
    wedges: [],
    decorations: [],
    extent: rect(0, 0, positioned.width, positioned.height),
  });
};
