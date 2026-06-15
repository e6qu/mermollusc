import { px } from "@m/std";
import type { Point, Px } from "@m/std";
import type { NodeShape, Scene, SceneNode } from "@m/contracts";

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
  return [
    {
      kind: "box",
      x: origin.x,
      y: origin.y,
      width: size.width,
      height: size.height,
      radius: px(cornerRadius(node.shape, size.width, size.height)),
    },
    label,
  ];
};

export const toDisplayList = (scene: Scene): DrawCmd[] => {
  const cmds: DrawCmd[] = [];
  for (const node of scene.nodes) cmds.push(...nodeCmds(node));
  for (const edge of scene.edges) {
    if (edge.waypoints.length >= 2) {
      cmds.push({
        kind: "polyline",
        points: edge.waypoints,
        dashed: edge.stroke === "dashed",
        arrow: edge.arrow === "filled",
      });
    }
  }
  return cmds;
};
