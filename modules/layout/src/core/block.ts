import { err, ok, point, rect, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
import type {
  BlockAst,
  EdgeEnd,
  EdgeKind,
  EdgeStroke,
  NodeId,
  Scene,
  SceneEdge,
  SceneNode,
} from "@m/contracts";
import type { LayoutError, MeasureText } from "./graph.js";
import { gridGeometry } from "./grid.js";
import { clampedWidth } from "./measure.js";

const LABEL_PADDING = 24;
const NODE_HEIGHT = 40;
const MIN_CELL_WIDTH = 48;
const GAP = 24;

const EDGE_STYLE: Record<EdgeKind, { readonly stroke: EdgeStroke; readonly toEnd: EdgeEnd }> = {
  arrow: { stroke: "solid", toEnd: "arrow" },
  open: { stroke: "solid", toEnd: "none" },
  dotted: { stroke: "dashed", toEnd: "arrow" },
  thick: { stroke: "solid", toEnd: "arrow" },
};

// Pure grid layout: blocks fill a `columns`-wide grid row-major in a uniform cell (sized to the
// widest label so the grid stays aligned); edges are straight centre-to-centre lines.
export const layoutBlock = (ast: BlockAst, measure: MeasureText): Result<Scene, LayoutError> => {
  const cellWidth = ast.blocks.reduce(
    (w, b) => Math.max(w, clampedWidth(b.label, measure, MIN_CELL_WIDTH, LABEL_PADDING)),
    MIN_CELL_WIDTH,
  );
  const columns = ast.columns; // `PositiveInt` — guaranteed ≥ 1 by the parser, no clamp needed
  const grid = gridGeometry(ast.blocks, columns, cellWidth, NODE_HEIGHT, GAP);

  const centers = new Map<NodeId, { readonly x: number; readonly y: number }>();
  const nodes: SceneNode[] = grid.positions.map(({ item: b, x, y }) => {
    centers.set(b.id, { x: x + cellWidth / 2, y: y + NODE_HEIGHT / 2 });
    return {
      id: sceneNodeId(b.id),
      bounds: rect(x, y, cellWidth, NODE_HEIGHT),
      label: b.label,
      shape: b.shape,
      parent: null,
      icon: b.icon,
      rows: null,
      rowDivider: null,
      subtitle: null,
      accent: "none",
      role: "normal",
    };
  });

  const edges: SceneEdge[] = [];
  for (const e of ast.edges) {
    const from = centers.get(e.from);
    const to = centers.get(e.to);
    if (from === undefined || to === undefined) {
      return err({ kind: "layout", message: `block: edge ${e.id} references an unknown block` });
    }
    edges.push({
      id: sceneEdgeId(e.id),
      from: sceneNodeId(e.from),
      to: sceneNodeId(e.to),
      waypoints: [point(from.x, from.y), point(to.x, to.y)],
      label: e.label,
      fromEnd: "none",
      curved: false,
      fromLabel: null,
      toLabel: null,
      ...EDGE_STYLE[e.kind],
    });
  }

  const { width, height } = grid.extent;
  return ok({ nodes, edges, wedges: [], decorations: [], extent: rect(0, 0, width, height) });
};
