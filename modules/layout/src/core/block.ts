import { brand, err, ok, point, rect, type Result } from "@m/std";
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

const labelWidth = (label: string, measure: MeasureText): number =>
  Math.max(MIN_CELL_WIDTH, measure(label) + LABEL_PADDING);

// Pure grid layout: blocks fill a `columns`-wide grid row-major in a uniform cell (sized to the
// widest label so the grid stays aligned); edges are straight centre-to-centre lines.
export const layoutBlock = (ast: BlockAst, measure: MeasureText): Result<Scene, LayoutError> => {
  const cellWidth = ast.blocks.reduce(
    (w, b) => Math.max(w, labelWidth(b.label, measure)),
    MIN_CELL_WIDTH,
  );
  const columns = Math.max(1, ast.columns);

  const centers = new Map<NodeId, { readonly x: number; readonly y: number }>();
  const nodes: SceneNode[] = ast.blocks.map((b, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = col * (cellWidth + GAP);
    const y = row * (NODE_HEIGHT + GAP);
    centers.set(b.id, { x: x + cellWidth / 2, y: y + NODE_HEIGHT / 2 });
    return {
      id: brand<string, "SceneNodeId">(b.id),
      bounds: rect(x, y, cellWidth, NODE_HEIGHT),
      label: b.label,
      shape: b.shape,
      parent: null,
      icon: b.icon,
      rows: null,
      rowDivider: null,
      subtitle: null,
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
      id: brand<string, "SceneEdgeId">(e.id),
      from: brand<string, "SceneNodeId">(e.from),
      to: brand<string, "SceneNodeId">(e.to),
      waypoints: [point(from.x, from.y), point(to.x, to.y)],
      label: e.label,
      fromEnd: "none",
      ...EDGE_STYLE[e.kind],
    });
  }

  const rows = Math.ceil(ast.blocks.length / columns);
  const usedColumns = Math.min(columns, Math.max(1, ast.blocks.length));
  const width = usedColumns * cellWidth + (usedColumns - 1) * GAP;
  const height = Math.max(1, rows) * NODE_HEIGHT + Math.max(0, rows - 1) * GAP;
  return ok({ nodes, edges, wedges: [], extent: rect(0, 0, width, height) });
};
