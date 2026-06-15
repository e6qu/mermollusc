import { brand, point, rect } from "@m/std";
import type {
  BlockAst,
  EdgeArrow,
  EdgeKind,
  EdgeStroke,
  Scene,
  SceneEdge,
  SceneNode,
} from "@m/contracts";

const CHAR_WIDTH = 8;
const LABEL_PADDING = 24;
const NODE_HEIGHT = 40;
const MIN_CELL_WIDTH = 48;
const GAP = 24;

const EDGE_STYLE: Record<EdgeKind, { readonly stroke: EdgeStroke; readonly arrow: EdgeArrow }> = {
  arrow: { stroke: "solid", arrow: "filled" },
  open: { stroke: "solid", arrow: "none" },
  dotted: { stroke: "dashed", arrow: "filled" },
  thick: { stroke: "solid", arrow: "filled" },
};

const labelWidth = (label: string): number =>
  Math.max(MIN_CELL_WIDTH, label.length * CHAR_WIDTH + LABEL_PADDING);

// Pure grid layout: blocks fill a `columns`-wide grid row-major in a uniform cell (sized to the
// widest label so the grid stays aligned); edges are straight centre-to-centre lines.
export const layoutBlock = (ast: BlockAst): Scene => {
  const cellWidth = ast.blocks.reduce((w, b) => Math.max(w, labelWidth(b.label)), MIN_CELL_WIDTH);
  const columns = Math.max(1, ast.columns);

  const centers = new Map<string, { readonly x: number; readonly y: number }>();
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
    };
  });

  const edges: SceneEdge[] = [];
  for (const e of ast.edges) {
    const from = centers.get(e.from);
    const to = centers.get(e.to);
    if (from === undefined || to === undefined) continue;
    edges.push({
      id: brand<string, "SceneEdgeId">(e.id),
      from: brand<string, "SceneNodeId">(e.from),
      to: brand<string, "SceneNodeId">(e.to),
      waypoints: [point(from.x, from.y), point(to.x, to.y)],
      label: e.label,
      ...EDGE_STYLE[e.kind],
    });
  }

  const rows = Math.ceil(ast.blocks.length / columns);
  const usedColumns = Math.min(columns, Math.max(1, ast.blocks.length));
  const width = usedColumns * cellWidth + (usedColumns - 1) * GAP;
  const height = Math.max(1, rows) * NODE_HEIGHT + Math.max(0, rows - 1) * GAP;
  return { nodes, edges, extent: rect(0, 0, width, height) };
};
