import { brand, point, rect } from "@m/std";
import type { CloudAst, CloudNodeKind, IconRef, Scene, SceneEdge, SceneNode } from "@m/contracts";
import type { MeasureText } from "./graph.js";

// Each cloud service kind maps to a representative glyph in the bundled simple-icons (CC0) pack.
const KIND_ICON: Record<CloudNodeKind, IconRef> = {
  compute: { pack: "simpleicons", name: "docker" },
  storage: { pack: "simpleicons", name: "googlecloudstorage" },
  database: { pack: "simpleicons", name: "postgresql" },
  queue: { pack: "simpleicons", name: "apachekafka" },
  cdn: { pack: "simpleicons", name: "cloudflare" },
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
  readonly id: string;
  readonly label: string;
  readonly parent: string | null;
  readonly icon: IconRef | null;
  readonly group: boolean;
}

const leafWidth = (label: string, measure: MeasureText): number =>
  Math.max(MIN_LEAF_WIDTH, measure(label) + LABEL_PADDING);

// Pure recursive nested-box layout: groups wrap their children (sized to fit) and render as
// containers; service leaves carry a kind glyph. Links are straight, undirected centre-to-centre.
export const layoutCloud = (ast: CloudAst, measure: MeasureText): Scene => {
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

  const childrenOf = new Map<string, Elem[]>();
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

  const boxes = new Map<string, Box>();
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

  const nodes: SceneNode[] = elements.map((el) => {
    const b = boxes.get(el.id) ?? { x: 0, y: 0, w: MIN_LEAF_WIDTH, h: LEAF_HEIGHT };
    return {
      id: brand<string, "SceneNodeId">(el.id),
      bounds: rect(b.x, b.y, b.w, b.h),
      label: el.label,
      shape: el.group ? "container" : "rect",
      parent: el.parent === null ? null : brand<string, "SceneNodeId">(el.parent),
      icon: el.icon,
    };
  });

  const edges: SceneEdge[] = [];
  for (const link of ast.links) {
    const from = boxes.get(link.from);
    const to = boxes.get(link.to);
    if (from === undefined || to === undefined) continue;
    edges.push({
      id: brand<string, "SceneEdgeId">(link.id),
      from: brand<string, "SceneNodeId">(link.from),
      to: brand<string, "SceneNodeId">(link.to),
      waypoints: [
        point(from.x + from.w / 2, from.y + from.h / 2),
        point(to.x + to.w / 2, to.y + to.h / 2),
      ],
      label: link.label,
      stroke: "solid",
      arrow: "none",
    });
  }

  let width = 0;
  let height = 0;
  for (const b of boxes.values()) {
    width = Math.max(width, b.x + b.w);
    height = Math.max(height, b.y + b.h);
  }
  return { nodes, edges, extent: rect(0, 0, width, height) };
};
