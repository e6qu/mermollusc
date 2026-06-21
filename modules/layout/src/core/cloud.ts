import { err, ok, point, rect, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
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
const GAP = 24;
const LEAF_HEIGHT = 56;
const LABEL_PADDING = 24;
const MIN_LEAF_WIDTH = 80;

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
  Math.max(MIN_LEAF_WIDTH, measure(label) + LABEL_PADDING);

// Pure recursive nested-box layout: groups wrap their children (sized to fit) and render as
// containers; service leaves carry a kind glyph. Links are straight, undirected centre-to-centre.
export const layoutCloud = (ast: CloudAst, measure: MeasureText): Result<Scene, LayoutError> => {
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
  const place = (el: Elem, x: number, y: number): Box => {
    const kids = childrenOf.get(el.id) ?? [];
    if (kids.length === 0) {
      const box: Box = { x, y, w: leafWidth(el.label, measure), h: LEAF_HEIGHT };
      boxes.set(el.id, box);
      return box;
    }
    let cursor = x + PADDING;
    let maxHeight = 0;
    for (const kid of kids) {
      const kidBox = place(kid, cursor, y + HEADER);
      cursor += kidBox.w + GAP;
      maxHeight = Math.max(maxHeight, kidBox.h);
    }
    const innerWidth = cursor - GAP - (x + PADDING);
    const box: Box = { x, y, w: innerWidth + 2 * PADDING, h: HEADER + maxHeight + PADDING };
    boxes.set(el.id, box);
    return box;
  };

  let cursor = 0;
  for (const root of roots) {
    cursor += place(root, cursor, 0).w + GAP;
  }

  // Every element is reached from a root through `place`; an unplaced one means its `parent` points
  // outside the element set (a dangling or cyclic reference), so fail loudly instead of stacking it
  // at the origin.
  const nodes: SceneNode[] = [];
  for (const el of elements) {
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
    });
  }

  const edges: SceneEdge[] = [];
  for (const link of ast.links) {
    const from = boxes.get(link.from);
    const to = boxes.get(link.to);
    if (from === undefined || to === undefined) {
      return err({ kind: "layout", message: `cloud: link ${link.id} references an unknown node` });
    }
    edges.push({
      id: sceneEdgeId(link.id),
      from: sceneNodeId(link.from),
      to: sceneNodeId(link.to),
      waypoints: [
        point(from.x + from.w / 2, from.y + from.h / 2),
        point(to.x + to.w / 2, to.y + to.h / 2),
      ],
      label: link.label,
      stroke: "solid",
      fromEnd: "none",
      toEnd: "none",
      curved: false,
      fromLabel: null,
      toLabel: null,
    });
  }

  let width = 0;
  let height = 0;
  for (const b of boxes.values()) {
    width = Math.max(width, b.x + b.w);
    height = Math.max(height, b.y + b.h);
  }
  return ok({ nodes, edges, wedges: [], extent: rect(0, 0, width, height) });
};
