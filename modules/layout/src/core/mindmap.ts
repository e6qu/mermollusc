import { ok, point, rect, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
import type {
  MindmapAst,
  MindmapNode,
  MindmapShape,
  NodeShape,
  Scene,
  SceneEdge,
  SceneNode,
} from "@m/contracts";
import type { LayoutError, MeasureText } from "./graph.js";

const RING = 150; // radial distance between successive depth levels
const NODE_H = 34;
const PAD = 22; // horizontal label padding
const MIN_W = 44;
const MARGIN = 24;

const SHAPE: Record<MindmapShape, NodeShape> = {
  default: "round",
  rounded: "round",
  square: "rect",
  circle: "circle",
  hexagon: "diamond", // the SceneGraph has no hexagon; a diamond is the nearest "special" shape
};

interface XY {
  readonly x: number;
  readonly y: number;
}

// Deterministic radial mindmap layout — no ELK. The root sits at the centre and each subtree fans out
// into an angular sector sized by its leaf count (so dense branches get more room), with depth mapped
// to radius. A forest (more than one root) treats the centre as virtual and distributes the roots
// around it. Edges are straight parent→child spokes (arrowless). Produces a Scene the renderer draws
// with no changes — replacing the earlier layered-tree-via-ELK rendering.
export const layoutMindmap = (
  ast: MindmapAst,
  measure: MeasureText,
): Result<Scene, LayoutError> => {
  if (ast.nodes.length === 0) {
    return ok({ nodes: [], edges: [], wedges: [], extent: rect(0, 0, 2 * MARGIN, 2 * MARGIN) });
  }

  const byParent = new Map<string, MindmapNode[]>();
  const roots: MindmapNode[] = [];
  for (const node of ast.nodes) {
    if (node.parent === null) {
      roots.push(node);
    } else {
      const siblings = byParent.get(node.parent);
      if (siblings === undefined) byParent.set(node.parent, [node]);
      else siblings.push(node);
    }
  }

  const leafMemo = new Map<string, number>();
  const leaves = (node: MindmapNode): number => {
    const cached = leafMemo.get(node.id);
    if (cached !== undefined) return cached;
    const kids = byParent.get(node.id) ?? [];
    const count = kids.length === 0 ? 1 : kids.reduce((sum, k) => sum + leaves(k), 0);
    leafMemo.set(node.id, count);
    return count;
  };

  const forest = roots.length > 1;
  const pos = new Map<string, XY>();
  // Places `node` at the centre of its angular sector [start, end); recurses into children, splitting
  // the sector by leaf weight. `forest` shifts every node out one ring so the roots ring a virtual hub.
  const place = (node: MindmapNode, start: number, end: number): void => {
    const mid = (start + end) / 2;
    const depth = node.level + (forest ? 1 : 0);
    const r = depth * RING;
    pos.set(node.id, { x: r * Math.cos(mid), y: r * Math.sin(mid) });
    const kids = byParent.get(node.id) ?? [];
    const totalLeaves = kids.reduce((sum, k) => sum + leaves(k), 0) || 1;
    let a = start;
    for (const kid of kids) {
      const span = (end - start) * (leaves(kid) / totalLeaves);
      place(kid, a, a + span);
      a += span;
    }
  };

  const TWO_PI = Math.PI * 2;
  if (forest) {
    const totalLeaves = roots.reduce((sum, r) => sum + leaves(r), 0) || 1;
    let a = 0;
    for (const root of roots) {
      const span = TWO_PI * (leaves(root) / totalLeaves);
      place(root, a, a + span);
      a += span;
    }
  } else {
    const root = roots[0];
    if (root !== undefined) place(root, 0, TWO_PI);
  }

  const sizeOf = (node: MindmapNode): { readonly w: number; readonly h: number } => ({
    w: Math.max(MIN_W, measure(node.label) + PAD),
    h: NODE_H,
  });

  // Bounds over all node boxes (centred on their positions), so we can shift into positive coordinates.
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of ast.nodes) {
    const p = pos.get(node.id);
    if (p === undefined) continue;
    const { w, h } = sizeOf(node);
    minX = Math.min(minX, p.x - w / 2);
    minY = Math.min(minY, p.y - h / 2);
    maxX = Math.max(maxX, p.x + w / 2);
    maxY = Math.max(maxY, p.y + h / 2);
  }
  const dx = MARGIN - minX;
  const dy = MARGIN - minY;

  const nodes: SceneNode[] = [];
  const centerOf = new Map<string, XY>();
  for (const node of ast.nodes) {
    const p = pos.get(node.id);
    if (p === undefined) continue;
    const { w, h } = sizeOf(node);
    const cx = p.x + dx;
    const cy = p.y + dy;
    centerOf.set(node.id, { x: cx, y: cy });
    nodes.push({
      id: sceneNodeId(node.id),
      bounds: rect(cx - w / 2, cy - h / 2, w, h),
      label: node.label,
      shape: SHAPE[node.shape],
      parent: null,
      icon: null,
      rows: null,
      rowDivider: null,
      subtitle: null,
    });
  }

  const edges: SceneEdge[] = [];
  for (const node of ast.nodes) {
    if (node.parent === null) continue;
    const from = centerOf.get(node.parent);
    const to = centerOf.get(node.id);
    if (from === undefined || to === undefined) continue;
    edges.push({
      id: sceneEdgeId(`mm:${node.id}`),
      from: sceneNodeId(node.parent),
      to: sceneNodeId(node.id),
      waypoints: [point(from.x, from.y), point(to.x, to.y)],
      label: null,
      stroke: "solid",
      fromEnd: "none",
      toEnd: "none",
      curved: true,
      fromLabel: null,
      toLabel: null,
    });
  }

  return ok({
    nodes,
    edges,
    wedges: [],
    extent: rect(0, 0, maxX - minX + 2 * MARGIN, maxY - minY + 2 * MARGIN),
  });
};
