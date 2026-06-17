import { px } from "@m/std";
import type { Point, Px } from "@m/std";
import type { IconRef, NodeShape, Scene, SceneNode } from "@m/contracts";

const ICON_SIZE = 20;

export type DrawCmd =
  | {
      readonly kind: "box";
      readonly x: Px;
      readonly y: Px;
      readonly width: Px;
      readonly height: Px;
      readonly radius: Px;
    }
  | {
      readonly kind: "diamond";
      readonly cx: Px;
      readonly cy: Px;
      readonly width: Px;
      readonly height: Px;
    }
  | {
      readonly kind: "polyline";
      readonly points: readonly Point[];
      readonly dashed: boolean;
      readonly arrow: boolean;
    }
  | {
      readonly kind: "icon";
      readonly ref: IconRef;
      readonly x: Px;
      readonly y: Px;
      readonly size: Px;
    }
  | { readonly kind: "label"; readonly x: Px; readonly y: Px; readonly text: string };

const cornerRadius = (shape: NodeShape, w: number, h: number): number => {
  switch (shape) {
    case "rect":
      return 0;
    case "round":
      return 8;
    case "stadium":
      return h / 2;
    case "circle":
      return Math.min(w, h) / 2;
    case "diamond":
      return 0;
    case "container":
      return 4;
  }
};

const nodeCmds = (node: SceneNode): DrawCmd[] => {
  const { origin, size } = node.bounds;
  const cx = px(origin.x + size.width / 2);
  const cy = px(origin.y + size.height / 2);
  const label = { kind: "label", x: cx, y: cy, text: node.label } satisfies DrawCmd;
  if (node.shape === "diamond") {
    return [{ kind: "diamond", cx, cy, width: size.width, height: size.height }, label];
  }
  if (node.shape === "container") {
    // A C4 boundary: outline with its label near the top so nested children don't overlap it.
    return [
      {
        kind: "box",
        x: origin.x,
        y: origin.y,
        width: size.width,
        height: size.height,
        radius: px(4),
      },
      { kind: "label", x: cx, y: px(origin.y + 12), text: node.label },
    ];
  }
  const box = {
    kind: "box",
    x: origin.x,
    y: origin.y,
    width: size.width,
    height: size.height,
    radius: px(cornerRadius(node.shape, size.width, size.height)),
  } satisfies DrawCmd;
  if (node.icon === null) return [box, label];
  // With an icon, stack the glyph above the label rather than centring the text on the box.
  return [
    box,
    {
      kind: "icon",
      ref: node.icon,
      x: px(origin.x + size.width / 2 - ICON_SIZE / 2),
      y: px(origin.y + 6),
      size: px(ICON_SIZE),
    },
    { kind: "label", x: cx, y: px(origin.y + 6 + ICON_SIZE + 6), text: node.label },
  ];
};

const LABEL_GAP = 11;

// Anchor an edge label at the midpoint *along the routed polyline*, nudged perpendicular to the
// local segment. The straight average of the endpoints can land inside a node when an orthogonal
// edge bends around one (e.g. a flowchart branch that routes down the side); the on-path midpoint
// stays in the routing channel ELK keeps clear, and the perpendicular nudge keeps the stroke from
// running through the text.
const edgeLabelAnchor = (points: readonly Point[]): { readonly x: Px; readonly y: Px } => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a !== undefined && b !== undefined) total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  let remaining = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen === 0) continue;
    if (remaining <= segLen) {
      const t = remaining / segLen;
      const nx = -(b.y - a.y) / segLen;
      const ny = (b.x - a.x) / segLen;
      return {
        x: px(a.x + (b.x - a.x) * t + nx * LABEL_GAP),
        y: px(a.y + (b.y - a.y) * t + ny * LABEL_GAP),
      };
    }
    remaining -= segLen;
  }
  const first = points[0];
  return first === undefined ? { x: px(0), y: px(0) } : { x: px(first.x), y: px(first.y) };
};

export const toDisplayList = (scene: Scene): DrawCmd[] => {
  const cmds: DrawCmd[] = [];
  for (const node of scene.nodes) cmds.push(...nodeCmds(node));
  for (const edge of scene.edges) {
    if (edge.waypoints.length < 2) continue;
    cmds.push({
      kind: "polyline",
      points: edge.waypoints,
      dashed: edge.stroke === "dashed",
      arrow: edge.arrow === "filled",
    });
    if (edge.label !== null) {
      const anchor = edgeLabelAnchor(edge.waypoints);
      cmds.push({ kind: "label", x: anchor.x, y: anchor.y, text: edge.label });
    }
  }
  return cmds;
};
