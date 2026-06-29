import { err, ok, point, rect, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
import { spreadPorts } from "./route.js";
import type {
  NetworkAst,
  NetworkGroup,
  NetworkNodeKind,
  NetworkNode,
  NodeAccent,
  NodeId,
  Scene,
  SceneEdge,
  SceneNode,
} from "@m/contracts";
import { ARCH_PACK } from "./icon-packs.js";
import type { LayoutError, MeasureText } from "./graph.js";
import { variableGrid, type Size } from "./grid.js";
import { optimalMountPoints } from "./route.js";
import { clampedWidth, selfLoopWaypoints, selfLoopLabelPos } from "./measure.js";

const LABEL_PADDING = 24;
const NODE_HEIGHT = 48;
const MIN_CELL_WIDTH = 64;
const GAP = 48;
const GROUP_PAD = 16; // inner padding around a subnet/zone's content
const GROUP_HEADER = 26; // subnet/zone title band
const MAX_NEST_DEPTH = 64; // a cyclic `parent` can't arise from the parser; cap to stay total

const KIND_ACCENT: Record<NetworkNodeKind, NodeAccent> = {
  server: "compute",
  database: "data",
  cloud: "network",
  router: "network",
  switch: "network",
  firewall: "security",
  host: "muted",
};

const groupAccent = (label: string): NodeAccent => {
  const l = label.toLowerCase();
  if (l.includes("dmz") || l.includes("edge") || l.includes("security")) return "security";
  if (l.includes("data") || l.includes("db")) return "data";
  if (l.includes("app") || l.includes("service") || l.includes("compute")) return "compute";
  if (l.includes("network") || l.includes("zone") || l.includes("subnet")) return "network";
  return "muted";
};

// Nested squarish-grid layout. Leaf nodes fill a `ceil(sqrt n)`-wide grid in a uniform cell; a
// subnet/zone `group "…" { … }` lays its own members out the same way and is placed as a single larger
// cell. With no groups this is exactly the prior flat grid (uniform cells → `variableGrid` degenerates
// to a fixed grid). Links stay straight, undirected centre-to-centre lines.
export const layoutNetwork = (
  ast: NetworkAst,
  measure: MeasureText,
): Result<Scene, LayoutError> => {
  const groupById = new Map<NodeId, NetworkGroup>(ast.groups.map((g) => [g.id, g]));
  const nodeById = new Map<NodeId, NetworkNode>(ast.nodes.map((n) => [n.id, n]));
  const cellWidth = ast.nodes.reduce(
    (w, n) => Math.max(w, clampedWidth(n.label, measure, MIN_CELL_WIDTH, LABEL_PADDING)),
    MIN_CELL_WIDTH,
  );

  // Direct children per container id. Put ungrouped/external leaf nodes before groups so a network's
  // ingress node (for example `cloud net "Internet"`) stays visually before the zones it connects to.
  const childrenOf = new Map<string, NodeId[]>();
  const rootIds: NodeId[] = [];
  const pushChild = (parent: NodeId | null, id: NodeId): void => {
    if (parent === null) {
      rootIds.push(id);
      return;
    }
    const kids = childrenOf.get(parent) ?? [];
    kids.push(id);
    childrenOf.set(parent, kids);
  };
  for (const n of ast.nodes) pushChild(n.parent, n.id);
  for (const g of ast.groups) pushChild(g.parent, g.id);

  const columnsFor = (count: number): number => Math.max(1, Math.ceil(Math.sqrt(count)));

  const nodes: SceneNode[] = [];
  const centers = new Map<NodeId, { readonly x: number; readonly y: number }>();
  const bounds = new Map<
    NodeId,
    { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  >();
  // The parser only mints acyclic parent graphs, but `layoutNetwork` is a total core function over a
  // branded AST: a hand-built cyclic `parent` would recurse forever, so cap the depth and fail loud.
  let overflow = false;

  // The intrinsic size of a child id: a uniform leaf cell, or a group = its members' nested grid plus
  // padding + a title band (and never narrower than its own label).
  const sizeOf = (id: NodeId, depth: number): Size => {
    if (depth > MAX_NEST_DEPTH || !groupById.has(id)) {
      if (depth > MAX_NEST_DEPTH) overflow = true;
      return { w: cellWidth, h: NODE_HEIGHT };
    }
    const kids = childrenOf.get(id) ?? [];
    const inner = variableGrid(
      kids.map((k) => sizeOf(k, depth + 1)),
      columnsFor(kids.length),
      GAP,
    );
    const labelW = clampedWidth(groupById.get(id)?.label ?? "", measure, 0, LABEL_PADDING);
    return {
      w: Math.max(inner.width, labelW) + 2 * GROUP_PAD,
      h: inner.height + GROUP_HEADER + GROUP_PAD,
    };
  };

  const place = (
    childIds: readonly NodeId[],
    ox: number,
    oy: number,
    parent: NodeId | null,
    depth: number,
  ): void => {
    if (depth > MAX_NEST_DEPTH) {
      overflow = true;
      return;
    }
    const sizes = childIds.map((id) => sizeOf(id, depth));
    const grid = variableGrid(
      sizes,
      parent === null ? childIds.length : columnsFor(childIds.length),
      GAP,
    );
    childIds.forEach((id, i) => {
      const cell = grid.cells[i];
      const size = sizes[i];
      if (cell === undefined || size === undefined) return;
      const cx = ox + cell.x;
      const cy = oy + cell.y;
      const sceneParent = parent === null ? null : sceneNodeId(parent);
      const g = groupById.get(id);
      if (g === undefined) {
        const n = nodeById.get(id);
        if (n === undefined) return;
        centers.set(id, { x: cx + cellWidth / 2, y: cy + NODE_HEIGHT / 2 });
        bounds.set(id, { x: cx, y: cy, w: cellWidth, h: NODE_HEIGHT });
        nodes.push({
          id: sceneNodeId(id),
          bounds: rect(cx, cy, cellWidth, NODE_HEIGHT),
          label: n.label,
          shape: "rect",
          parent: sceneParent,
          icon: n.icon ?? { pack: ARCH_PACK, name: n.kind },
          rows: null,
          rowDivider: null,
          subtitle: null,
          accent: KIND_ACCENT[n.kind],
          role: "normal",
        });
        return;
      }
      centers.set(id, { x: cx + size.w / 2, y: cy + size.h / 2 });
      bounds.set(id, { x: cx, y: cy, w: size.w, h: size.h });
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
        accent: groupAccent(g.label),
        role: "normal",
      });
      place(childrenOf.get(id) ?? [], cx + GROUP_PAD, cy + GROUP_HEADER, id, depth + 1);
    });
  };

  place(rootIds, 0, 0, null, 0);
  if (overflow) {
    return err({ kind: "layout", message: "network: group nesting too deep (cyclic parent?)" });
  }

  const edges: SceneEdge[] = [];
  for (const link of ast.links) {
    const fromBox = bounds.get(link.from);
    const toBox = bounds.get(link.to);
    if (fromBox === undefined || toBox === undefined) {
      return err({
        kind: "layout",
        message: `network: link ${link.id} references an unknown node`,
      });
    }
    const isSelf = link.from === link.to;
    edges.push({
      id: sceneEdgeId(link.id),
      from: sceneNodeId(link.from),
      to: sceneNodeId(link.to),
      waypoints: isSelf ? selfLoopWaypoints(fromBox) : optimalMountPoints(fromBox, toBox),
      label: link.label,
      stroke: "solid",
      fromEnd: "none",
      toEnd: "none",
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos:
        link.label === null
          ? null
          : isSelf
            ? selfLoopLabelPos(fromBox)
            : point(
                (fromBox.x + fromBox.w / 2 + toBox.x + toBox.w / 2) / 2,
                (fromBox.y + fromBox.h / 2 + toBox.y + toBox.h / 2) / 2,
              ),
    });
  }

  let width = 0;
  let height = 0;
  for (const n of nodes) {
    width = Math.max(width, n.bounds.origin.x + n.bounds.size.width);
    height = Math.max(height, n.bounds.origin.y + n.bounds.size.height);
  }
  // Spread connectors into per-side lanes so links sharing a node don't stack into one line.
  return ok(
    spreadPorts({ nodes, edges, wedges: [], decorations: [], extent: rect(0, 0, width, height) }),
  );
};
