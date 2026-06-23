import { err, ok, point, rect, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
import type { NetworkAst, NodeId, Scene, SceneEdge, SceneNode } from "@m/contracts";
import { ARCH_PACK } from "./icon-packs.js";
import type { LayoutError, MeasureText } from "./graph.js";
import { gridGeometry } from "./grid.js";
import { clampedWidth } from "./measure.js";

const LABEL_PADDING = 24;
const NODE_HEIGHT = 48;
const MIN_CELL_WIDTH = 64;
const GAP = 40;

// Pure squarish-grid layout: nodes fill a `ceil(sqrt n)`-wide grid in a uniform cell; links are
// straight, undirected centre-to-centre lines (no arrowheads).
export const layoutNetwork = (
  ast: NetworkAst,
  measure: MeasureText,
): Result<Scene, LayoutError> => {
  const cellWidth = ast.nodes.reduce(
    (w, n) => Math.max(w, clampedWidth(n.label, measure, MIN_CELL_WIDTH, LABEL_PADDING)),
    MIN_CELL_WIDTH,
  );
  const columns = Math.max(1, Math.ceil(Math.sqrt(ast.nodes.length)));
  const grid = gridGeometry(ast.nodes, columns, cellWidth, NODE_HEIGHT, GAP);

  const centers = new Map<NodeId, { readonly x: number; readonly y: number }>();
  const nodes: SceneNode[] = grid.positions.map(({ item: n, x, y }) => {
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

  const { width, height } = grid.extent;
  return ok({ nodes, edges, wedges: [], decorations: [], extent: rect(0, 0, width, height) });
};
