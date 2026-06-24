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
import type { Size } from "./grid.js";
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
  const pitch = cellWidth + GAP; // one column's horizontal stride

  interface Item {
    readonly id: NodeId;
    readonly span: number; // columns occupied (≥ 1, ≤ the container's columns)
    readonly size: Size; // rendered box
  }

  // A child's column span + rendered box. A leaf spans its declared `a:N` (a wider box); a composite
  // spans `max(block:id:N, the columns its content needs)`, snapped so its box is column-aligned.
  const itemOf = (id: NodeId, columns: number): Item => {
    const g = groupById.get(id);
    if (g === undefined) {
      const declared = blockById.get(id)?.span ?? 1;
      const span = Math.max(1, Math.min(declared, columns));
      return { id, span, size: { w: span * cellWidth + (span - 1) * GAP, h: NODE_HEIGHT } };
    }
    const inner = measureContainer(g.children, g.columns);
    const labelW = clampedWidth(g.label, measure, 0, LABEL_PADDING);
    const natW = Math.max(inner.w, labelW) + 2 * GROUP_PAD;
    const fit = Math.max(1, Math.ceil((natW + GAP) / pitch));
    const span = Math.max(1, Math.min(Math.max(g.span, fit), columns));
    return {
      id,
      span,
      size: { w: span * cellWidth + (span - 1) * GAP, h: inner.h + GROUP_HEADER + GROUP_PAD },
    };
  };

  // Auto-place items row-major in `columns`, honouring spans: an item that won't fit the rest of a row
  // wraps to the next. Returns each item's top-left + the content extent.
  const autoPlace = (
    items: readonly Item[],
    columns: number,
  ): { cells: { x: number; y: number }[]; width: number; height: number } => {
    let row = 0;
    let col = 0;
    const slots = items.map((it) => {
      if (col > 0 && col + it.span > columns) {
        row++;
        col = 0;
      }
      const slot = { col, row };
      col += it.span;
      return slot;
    });
    const rowH: number[] = [];
    slots.forEach((s, i) => {
      rowH[s.row] = Math.max(rowH[s.row] ?? 0, items[i]?.size.h ?? 0);
    });
    const rowY: number[] = [];
    let y = 0;
    for (let r = 0; r < rowH.length; r++) {
      rowY.push(y);
      y += (rowH[r] ?? 0) + GAP;
    }
    let width = 0;
    const cells = slots.map((s, i) => {
      const cell = { x: s.col * pitch, y: rowY[s.row] ?? 0 };
      width = Math.max(width, cell.x + (items[i]?.size.w ?? 0));
      return cell;
    });
    return { cells, width, height: Math.max(0, y - GAP) };
  };

  const measureContainer = (childIds: readonly NodeId[], columns: number): Size => {
    const ap = autoPlace(
      childIds.map((id) => itemOf(id, columns)),
      columns,
    );
    return { w: ap.width, h: ap.height };
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
    const items = childIds.map((id) => itemOf(id, columns));
    const ap = autoPlace(items, columns);
    childIds.forEach((id, i) => {
      const cell = ap.cells[i];
      const item = items[i];
      if (cell === undefined || item === undefined) return;
      const cx = ox + cell.x;
      const cy = oy + cell.y;
      const sceneParent = parent === null ? null : sceneNodeId(parent);
      const g = groupById.get(id);
      boxes.set(id, { x: cx, y: cy, w: item.size.w, h: item.size.h });
      if (g === undefined) {
        const b = blockById.get(id);
        if (b === undefined) return;
        nodes.push({
          id: sceneNodeId(id),
          bounds: rect(cx, cy, item.size.w, item.size.h),
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
      nodes.push({
        id: sceneNodeId(id),
        bounds: rect(cx, cy, item.size.w, item.size.h),
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
