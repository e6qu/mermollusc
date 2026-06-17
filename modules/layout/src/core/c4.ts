import { brand, point, rect } from "@m/std";
import type {
  C4Ast,
  C4Element,
  C4ElementKind,
  NodeShape,
  Scene,
  SceneEdge,
  SceneNode,
} from "@m/contracts";
import type { MeasureText } from "./graph.js";

const PADDING = 16;
const HEADER = 26; // space at the top of a boundary for its label
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

const leafWidth = (label: string, measure: MeasureText): number =>
  Math.max(MIN_LEAF_WIDTH, measure(label) + LABEL_PADDING);

const shapeOf = (kind: C4ElementKind): NodeShape =>
  kind === "boundary" ? "container" : kind === "person" ? "round" : "rect";

// Pure recursive nested-box layout: boundaries wrap their children (sized to fit), siblings sit
// in a row, relations are straight centre-to-centre edges. No ELK — coordinates are absolute.
export const layoutC4 = (ast: C4Ast, measure: MeasureText): Scene => {
  const childrenOf = new Map<string, C4Element[]>();
  const roots: C4Element[] = [];
  for (const el of ast.elements) {
    if (el.parent === null) {
      roots.push(el);
    } else {
      const siblings = childrenOf.get(el.parent) ?? [];
      siblings.push(el);
      childrenOf.set(el.parent, siblings);
    }
  }

  const boxes = new Map<string, Box>();
  const place = (el: C4Element, x: number, y: number): Box => {
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

  const nodes: SceneNode[] = ast.elements.map((el) => {
    const b = boxes.get(el.id) ?? { x: 0, y: 0, w: MIN_LEAF_WIDTH, h: LEAF_HEIGHT };
    return {
      id: brand<string, "SceneNodeId">(el.id),
      bounds: rect(b.x, b.y, b.w, b.h),
      label: el.label,
      shape: shapeOf(el.kind),
      parent: el.parent === null ? null : brand<string, "SceneNodeId">(el.parent),
      icon: null,
    };
  });

  const edges: SceneEdge[] = [];
  for (const rel of ast.rels) {
    const from = boxes.get(rel.from);
    const to = boxes.get(rel.to);
    if (from === undefined || to === undefined) continue;
    edges.push({
      id: brand<string, "SceneEdgeId">(rel.id),
      from: brand<string, "SceneNodeId">(rel.from),
      to: brand<string, "SceneNodeId">(rel.to),
      waypoints: [
        point(from.x + from.w / 2, from.y + from.h / 2),
        point(to.x + to.w / 2, to.y + to.h / 2),
      ],
      label: rel.label === "" ? null : rel.label,
      stroke: "solid",
      arrow: "filled",
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
