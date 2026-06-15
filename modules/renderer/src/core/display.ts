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
    const first = edge.waypoints[0];
    const last = edge.waypoints[edge.waypoints.length - 1];
    if (edge.label !== null && first !== undefined && last !== undefined) {
      cmds.push({
        kind: "label",
        x: px((first.x + last.x) / 2),
        y: px((first.y + last.y) / 2 - 8),
        text: edge.label,
      });
    }
  }
  return cmds;
};
