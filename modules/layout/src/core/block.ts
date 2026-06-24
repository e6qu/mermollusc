import { err, ok, rect, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
import type {
  BlockAst,
  BlockGroup,
  BlockNode,
  EdgeEnd,
  EdgeKind,
  EdgeStroke,
  NodeId,
  Scene,
  SceneEdge,
  SceneNode,
} from "@m/contracts";
import type { LayoutError, MeasureText } from "./graph.js";
import { variableGrid, type Size } from "./grid.js";
import { clampedWidth } from "./measure.js";
import { orthogonalRoute, type RouteBox } from "./route.js";

const LABEL_PADDING = 24;
const NODE_HEIGHT = 40;
const MIN_CELL_WIDTH = 48;
const GAP = 24;
const GROUP_PAD = 14; // inner padding around a composite's content
const GROUP_HEADER = 24; // composite title band

const EDGE_STYLE: Record<EdgeKind, { readonly stroke: EdgeStroke; readonly toEnd: EdgeEnd }> = {
  arrow: { stroke: "solid", toEnd: "arrow" },
  open: { stroke: "solid", toEnd: "none" },
  dotted: { stroke: "dashed", toEnd: "arrow" },
  thick: { stroke: "solid", toEnd: "arrow" },
};

// Pure nested grid layout. Leaf blocks fill a `columns`-wide grid in a uniform cell (sized to the
// widest label); a `block:id … end` composite lays its own children out in a nested grid and is placed
// as a single (larger) cell. Edges route orthogonally between the facing sides — including across a
// composite boundary, since every leaf box is absolute.
export const layoutBlock = (ast: BlockAst, measure: MeasureText): Result<Scene, LayoutError> => {
  const groupById = new Map<NodeId, BlockGroup>(ast.groups.map((g) => [g.id, g]));
  const blockById = new Map<NodeId, BlockNode>(ast.blocks.map((b) => [b.id, b]));
  const cellWidth = ast.blocks.reduce(
    (w, b) => Math.max(w, clampedWidth(b.label, measure, MIN_CELL_WIDTH, LABEL_PADDING)),
    MIN_CELL_WIDTH,
  );

  const nodes: SceneNode[] = [];
  const boxes = new Map<NodeId, RouteBox>();

  // The intrinsic size of a child id: a uniform leaf cell, or a composite = its (recursively measured)
  // content plus padding + a title band (and never narrower than its own label).
  const measureContainer = (childIds: readonly NodeId[], columns: number): Size => {
    const g = variableGrid(childIds.map(sizeOf), columns, GAP);
    return { w: g.width, h: g.height };
  };
  const sizeOf = (id: NodeId): Size => {
    const g = groupById.get(id);
    if (g === undefined) return { w: cellWidth, h: NODE_HEIGHT };
    const inner = measureContainer(g.children, g.columns);
    const labelW = clampedWidth(g.label, measure, 0, LABEL_PADDING);
    return { w: Math.max(inner.w, labelW) + 2 * GROUP_PAD, h: inner.h + GROUP_HEADER + GROUP_PAD };
  };

  // Emit SceneNodes for a container's children at content origin (ox, oy); `parent` is the enclosing
  // composite id (null at the top). Recurses into composites.
  const place = (
    childIds: readonly NodeId[],
    columns: number,
    ox: number,
    oy: number,
    parent: NodeId | null,
  ): void => {
    const sizes = childIds.map(sizeOf);
    const grid = variableGrid(sizes, columns, GAP);
    childIds.forEach((id, i) => {
      const cell = grid.cells[i];
      const size = sizes[i];
      if (cell === undefined || size === undefined) return;
      const cx = ox + cell.x;
      const cy = oy + cell.y;
      const sceneParent = parent === null ? null : sceneNodeId(parent);
      const g = groupById.get(id);
      if (g === undefined) {
        const b = blockById.get(id);
        if (b === undefined) return;
        boxes.set(id, { x: cx, y: cy, w: cellWidth, h: NODE_HEIGHT });
        nodes.push({
          id: sceneNodeId(id),
          bounds: rect(cx, cy, cellWidth, NODE_HEIGHT),
          label: b.label,
          shape: b.shape,
          parent: sceneParent,
          icon: b.icon,
          rows: null,
          rowDivider: null,
          subtitle: null,
          accent: "none",
          role: "normal",
        });
        return;
      }
      boxes.set(id, { x: cx, y: cy, w: size.w, h: size.h });
      nodes.push({
        id: sceneNodeId(id),
        bounds: rect(cx, cy, size.w, size.h),
        label: g.label,
        shape: "container",
        parent: sceneParent,
        icon: null,
        rows: null,
        rowDivider: null,
        subtitle: null,
        accent: "none",
        role: "normal",
      });
      place(g.children, g.columns, cx + GROUP_PAD, cy + GROUP_HEADER, id);
    });
  };

  place(ast.roots, ast.columns, 0, 0, null);

  const edges: SceneEdge[] = [];
  for (const e of ast.edges) {
    const from = boxes.get(e.from);
    const to = boxes.get(e.to);
    if (from === undefined || to === undefined) {
      return err({ kind: "layout", message: `block: edge ${e.id} references an unknown block` });
    }
    edges.push({
      id: sceneEdgeId(e.id),
      from: sceneNodeId(e.from),
      to: sceneNodeId(e.to),
      waypoints: orthogonalRoute(from, to),
      label: e.label,
      fromEnd: "none",
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos: null,
      ...EDGE_STYLE[e.kind],
    });
  }

  const top = measureContainer(ast.roots, ast.columns);
  return ok({ nodes, edges, wedges: [], decorations: [], extent: rect(0, 0, top.w, top.h) });
};
