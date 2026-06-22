import { err, ok, point, rect, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
import type { NetworkAst, NodeId, Scene, SceneEdge, SceneNode } from "@m/contracts";
import { ARCH_PACK } from "./icon-packs.js";
import type { LayoutError, MeasureText } from "./graph.js";

const LABEL_PADDING = 24;
const NODE_HEIGHT = 48;
const MIN_CELL_WIDTH = 64;
const GAP = 40;

const labelWidth = (label: string, measure: MeasureText): number =>
  Math.max(MIN_CELL_WIDTH, measure(label) + LABEL_PADDING);

// Pure squarish-grid layout: nodes fill a `ceil(sqrt n)`-wide grid in a uniform cell; links are
// straight, undirected centre-to-centre lines (no arrowheads).
export const layoutNetwork = (
  ast: NetworkAst,
  measure: MeasureText,
): Result<Scene, LayoutError> => {
  const cellWidth = ast.nodes.reduce(
    (w, n) => Math.max(w, labelWidth(n.label, measure)),
    MIN_CELL_WIDTH,
  );
  const columns = Math.max(1, Math.ceil(Math.sqrt(ast.nodes.length)));

  const centers = new Map<NodeId, { readonly x: number; readonly y: number }>();
  const nodes: SceneNode[] = ast.nodes.map((n, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = col * (cellWidth + GAP);
    const y = row * (NODE_HEIGHT + GAP);
    centers.set(n.id, { x: x + cellWidth / 2, y: y + NODE_HEIGHT / 2 });
    return {
      id: sceneNodeId(n.id),
      bounds: rect(x, y, cellWidth, NODE_HEIGHT),
      label: n.label,
      shape: "rect",
      parent: null,
      // An explicit `icon "<pack>/<name>"` override wins; otherwise the kind maps 1:1 to a glyph
      // name in the built-in arch pack.
      icon: n.icon ?? { pack: ARCH_PACK, name: n.kind },
      rows: null,
      rowDivider: null,
      subtitle: null,
      accent: "none",
      role: "normal",
    };
  });

  const edges: SceneEdge[] = [];
  for (const link of ast.links) {
    const from = centers.get(link.from);
    const to = centers.get(link.to);
    if (from === undefined || to === undefined) {
      return err({
        kind: "layout",
        message: `network: link ${link.id} references an unknown node`,
      });
    }
    edges.push({
      id: sceneEdgeId(link.id),
      from: sceneNodeId(link.from),
      to: sceneNodeId(link.to),
      waypoints: [point(from.x, from.y), point(to.x, to.y)],
      label: link.label,
      stroke: "solid",
      fromEnd: "none",
      toEnd: "none",
      curved: false,
      fromLabel: null,
      toLabel: null,
    });
  }

  const rows = Math.ceil(ast.nodes.length / columns);
  const usedColumns = Math.min(columns, Math.max(1, ast.nodes.length));
  const width = usedColumns * cellWidth + (usedColumns - 1) * GAP;
  const height = Math.max(1, rows) * NODE_HEIGHT + Math.max(0, rows - 1) * GAP;
  return ok({ nodes, edges, wedges: [], decorations: [], extent: rect(0, 0, width, height) });
};
