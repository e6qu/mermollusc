import { err, ok, rect, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
import { orthogonalRoute, routeChannelMid, spreadPorts } from "./route.js";
import type {
  CloudAst,
  CloudNodeKind,
  IconRef,
  NodeId,
  Scene,
  SceneEdge,
  SceneNode,
} from "@m/contracts";
import { SIMPLE_ICONS_PACK } from "./icon-packs.js";
import type { LayoutError, MeasureText } from "./graph.js";
import { clampedWidth } from "./measure.js";

// Each cloud service kind maps to a representative glyph in the bundled simple-icons (CC0) pack.
const KIND_ICON: Record<CloudNodeKind, IconRef> = {
  compute: { pack: SIMPLE_ICONS_PACK, name: "docker" },
  storage: { pack: SIMPLE_ICONS_PACK, name: "googlecloudstorage" },
  database: { pack: SIMPLE_ICONS_PACK, name: "postgresql" },
  queue: { pack: SIMPLE_ICONS_PACK, name: "apachekafka" },
  cdn: { pack: SIMPLE_ICONS_PACK, name: "cloudflare" },
};

const PADDING = 16;
const HEADER = 26; // space at the top of a group for its label
const GAP = 44;
// A wider lane between stacked rows than between side-by-side boxes: cross-row connectors (e.g. an
// app tier wiring down to a data tier) share that vertical channel, so the extra room lets the router
// spread and detour them instead of stacking them into one congested band.
const ROW_GAP = 72;
const LEAF_HEIGHT = 56;
const LABEL_PADDING = 24;
const MIN_LEAF_WIDTH = 80;
// Soft width budget for a row of top-level boxes before wrapping to the next row (keeps a large
// architecture roughly square rather than one very wide strip).
const MAX_ROW_WIDTH = 900;
const MAX_NEST_DEPTH = 64; // a cyclic `parent` can't arise from the parser; cap to stay total

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Elem {
  readonly id: NodeId;
  readonly label: string;
  readonly parent: NodeId | null;
  readonly icon: IconRef | null;
  readonly group: boolean;
}

const leafWidth = (label: string, measure: MeasureText): number =>
  clampedWidth(label, measure, MIN_LEAF_WIDTH, LABEL_PADDING);

// Pure recursive nested-box layout: groups wrap their children (sized to fit) and render as
// containers; service leaves carry a kind glyph. Links are straight, undirected centre-to-centre.
export const layoutCloud = (
  ast: CloudAst,
  measure: MeasureText,
  collapsed: ReadonlySet<NodeId> = new Set(),
): Result<Scene, LayoutError> => {
  const elements: Elem[] = [
    ...ast.groups.map((g) => ({
      id: g.id,
      label: g.label,
      parent: g.parent,
      icon: null,
      group: true,
    })),
    ...ast.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      parent: n.parent,
      // An explicit `icon "<pack>/<name>"` override wins; otherwise the kind's default glyph.
      icon: n.icon ?? KIND_ICON[n.kind],
      group: false,
    })),
  ];
  const elById = new Map<NodeId, Elem>(elements.map((el) => [el.id, el]));

  // A node is hidden when an ancestor group is collapsed; its outermost collapsed ancestor is the
  // "anchor" the layout shows + that its links re-attach to.
  const anchorOf = (id: NodeId): NodeId => {
    let cur = elById.get(id);
    let anchor = id;
    while (cur !== undefined && cur.parent !== null) {
      if (collapsed.has(cur.parent)) anchor = cur.parent;
      cur = elById.get(cur.parent);
    }
    return anchor;
  };
  const hidden = new Set<NodeId>(
    elements.filter((el) => anchorOf(el.id) !== el.id).map((el) => el.id),
  );

  const childrenOf = new Map<NodeId, Elem[]>();
  const roots: Elem[] = [];
  for (const el of elements) {
    if (el.parent === null) {
      roots.push(el);
    } else {
      const siblings = childrenOf.get(el.parent) ?? [];
      siblings.push(el);
      childrenOf.set(el.parent, siblings);
    }
  }

  const boxes = new Map<NodeId, Box>();
  // A branded AST whose `parent` chain is cyclic (e.g. a duplicate id nested in its twin) would make
  // this `childrenOf`-keyed recursion re-enter the same bucket forever; cap the depth and fail loud.
  let overflow = false;
  const place = (el: Elem, x: number, y: number, depth: number): Box => {
    const kids = childrenOf.get(el.id) ?? [];
    // A collapsed group is drawn as a header-only box and its descendants aren't placed at all.
    if (kids.length === 0 || collapsed.has(el.id) || depth > MAX_NEST_DEPTH) {
      if (depth > MAX_NEST_DEPTH) overflow = true;
      const box: Box = { x, y, w: leafWidth(el.label, measure), h: LEAF_HEIGHT };
      boxes.set(el.id, box);
      return box;
    }
    let cursor = x + PADDING;
    let maxHeight = 0;
    for (const kid of kids) {
      const kidBox = place(kid, cursor, y + HEADER, depth + 1);
      cursor += kidBox.w + GAP;
      maxHeight = Math.max(maxHeight, kidBox.h);
    }
    const innerWidth = cursor - GAP - (x + PADDING);
    const box: Box = { x, y, w: innerWidth + 2 * PADDING, h: HEADER + maxHeight + PADDING };
    boxes.set(el.id, box);
    return box;
  };

  // Lay the top-level boxes left-to-right, wrapping to a new row once a row would exceed the soft width
  // budget — so a large architecture stays compact (roughly square) instead of one very wide strip.
  // Each root is placed tentatively, then re-placed at the start of the next row when it overflows.
  let cx = 0;
  let cy = 0;
  let rowHeight = 0;
  for (const root of roots) {
    let b = place(root, cx, cy, 0);
    if (cx > 0 && cx + b.w > MAX_ROW_WIDTH) {
      cy += rowHeight + ROW_GAP;
      cx = 0;
      rowHeight = 0;
      b = place(root, cx, cy, 0);
    }
    cx += b.w + GAP;
    rowHeight = Math.max(rowHeight, b.h);
  }
  if (overflow) {
    return err({ kind: "layout", message: "cloud: group nesting too deep (cyclic parent?)" });
  }

  // Every element is reached from a root through `place`; an unplaced one means its `parent` points
  // outside the element set (a dangling or cyclic reference), so fail loudly instead of stacking it
  // at the origin.
  const nodes: SceneNode[] = [];
  for (const el of elements) {
    if (hidden.has(el.id)) continue; // inside a collapsed group — not drawn
    const b = boxes.get(el.id);
    if (b === undefined) {
      return err({
        kind: "layout",
        message: `cloud: element ${el.id} has no box (dangling parent?)`,
      });
    }
    nodes.push({
      id: sceneNodeId(el.id),
      bounds: rect(b.x, b.y, b.w, b.h),
      label: el.label,
      shape: el.group ? "container" : "rect",
      parent: el.parent === null ? null : sceneNodeId(el.parent),
      icon: el.icon,
      rows: null,
      rowDivider: null,
      subtitle: null,
      accent: "none",
      role: "normal",
    });
  }

  const edges: SceneEdge[] = [];
  for (const link of ast.links) {
    // Re-attach a link touching a hidden node to its collapsed container; drop it if both ends collapse
    // into the same group (it would become a self-loop on the container).
    const fromId = anchorOf(link.from);
    const toId = anchorOf(link.to);
    if (fromId === toId) continue;
    const from = boxes.get(fromId);
    const to = boxes.get(toId);
    if (from === undefined || to === undefined) {
      return err({ kind: "layout", message: `cloud: link ${link.id} references an unknown node` });
    }
    const route = orthogonalRoute(from, to);
    edges.push({
      id: sceneEdgeId(link.id),
      from: sceneNodeId(fromId),
      to: sceneNodeId(toId),
      waypoints: route,
      label: link.label,
      stroke: "solid",
      fromEnd: "none",
      toEnd: link.directed ? "arrow" : "none",
      curved: false,
      fromLabel: null,
      toLabel: null,
      // Anchor the label in the route's central channel (between the boxes), not the whole-route
      // midpoint that can land on a node.
      labelPos: link.label === null ? null : routeChannelMid(route),
    });
  }

  let width = 0;
  let height = 0;
  for (const b of boxes.values()) {
    width = Math.max(width, b.x + b.w);
    height = Math.max(height, b.y + b.h);
  }
  // Spread connectors into per-side lanes so several links touching the same node don't stack into one line.
  return ok(
    spreadPorts({ nodes, edges, wedges: [], decorations: [], extent: rect(0, 0, width, height) }),
  );
};
