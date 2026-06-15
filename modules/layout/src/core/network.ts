import { brand, point, rect } from "@m/std";
import type { NetworkAst, Scene, SceneEdge, SceneNode } from "@m/contracts";

const CHAR_WIDTH = 8;
const LABEL_PADDING = 24;
const NODE_HEIGHT = 48;
const MIN_CELL_WIDTH = 64;
const GAP = 40;

const labelWidth = (label: string): number =>
  Math.max(MIN_CELL_WIDTH, label.length * CHAR_WIDTH + LABEL_PADDING);

// Pure squarish-grid layout: nodes fill a `ceil(sqrt n)`-wide grid in a uniform cell; links are
// straight, undirected centre-to-centre lines (no arrowheads).
export const layoutNetwork = (ast: NetworkAst): Scene => {
  const cellWidth = ast.nodes.reduce((w, n) => Math.max(w, labelWidth(n.label)), MIN_CELL_WIDTH);
  const columns = Math.max(1, Math.ceil(Math.sqrt(ast.nodes.length)));

  const centers = new Map<string, { readonly x: number; readonly y: number }>();
  const nodes: SceneNode[] = ast.nodes.map((n, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = col * (cellWidth + GAP);
    const y = row * (NODE_HEIGHT + GAP);
    centers.set(n.id, { x: x + cellWidth / 2, y: y + NODE_HEIGHT / 2 });
    return {
      id: brand<string, "SceneNodeId">(n.id),
      bounds: rect(x, y, cellWidth, NODE_HEIGHT),
      label: n.label,
      shape: "rect",
      parent: null,
      // An explicit `icon "<pack>/<name>"` override wins; otherwise the kind maps 1:1 to a glyph
      // name in the built-in "arch" pack.
      icon: n.icon ?? { pack: "arch", name: n.kind },
    };
  });

  const edges: SceneEdge[] = [];
  for (const link of ast.links) {
    const from = centers.get(link.from);
    const to = centers.get(link.to);
    if (from === undefined || to === undefined) continue;
    edges.push({
      id: brand<string, "SceneEdgeId">(link.id),
      from: brand<string, "SceneNodeId">(link.from),
      to: brand<string, "SceneNodeId">(link.to),
      waypoints: [point(from.x, from.y), point(to.x, to.y)],
      label: link.label,
      stroke: "solid",
      arrow: "none",
    });
  }

  const rows = Math.ceil(ast.nodes.length / columns);
  const usedColumns = Math.min(columns, Math.max(1, ast.nodes.length));
  const width = usedColumns * cellWidth + (usedColumns - 1) * GAP;
  const height = Math.max(1, rows) * NODE_HEIGHT + Math.max(0, rows - 1) * GAP;
  return { nodes, edges, extent: rect(0, 0, width, height) };
};
