import { brand, err, ok, point, rect, type Result } from "@m/std";
import type {
  C4Ast,
  C4Element,
  C4ElementId,
  C4ElementKind,
  NodeShape,
  Scene,
  SceneEdge,
  SceneNode,
} from "@m/contracts";
import type { LayoutError, MeasureText } from "./graph.js";

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

// The text the renderer draws: the label, with the optional description as a second line. (The
// renderer splits a label on newlines and stacks the lines.)
const sceneLabel = (el: C4Element): string =>
  el.description === null ? el.label : `${el.label}\n${el.description}`;

const widestLine = (text: string, measure: MeasureText): number =>
  text.split("\n").reduce((w, line) => Math.max(w, measure(line)), 0);

const leafWidth = (label: string, measure: MeasureText): number =>
  Math.max(MIN_LEAF_WIDTH, widestLine(label, measure) + LABEL_PADDING);

const shapeOf = (kind: C4ElementKind): NodeShape =>
  kind === "boundary" ? "container" : kind === "person" ? "round" : "rect";

// Pure recursive nested-box layout: boundaries wrap their children (sized to fit), siblings sit
// in a row, relations are straight centre-to-centre edges. No ELK — coordinates are absolute.
export const layoutC4 = (ast: C4Ast, measure: MeasureText): Result<Scene, LayoutError> => {
  const childrenOf = new Map<C4ElementId, C4Element[]>();
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

  const boxes = new Map<C4ElementId, Box>();
  const place = (el: C4Element, x: number, y: number): Box => {
    const kids = childrenOf.get(el.id) ?? [];
    if (kids.length === 0) {
      const box: Box = { x, y, w: leafWidth(sceneLabel(el), measure), h: LEAF_HEIGHT };
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
  for (const el of ast.elements) {
    const b = boxes.get(el.id);
    if (b === undefined) {
      return err({ kind: "layout", message: `c4: element ${el.id} has no box (dangling parent?)` });
    }
    nodes.push({
      id: brand<string, "SceneNodeId">(el.id),
      bounds: rect(b.x, b.y, b.w, b.h),
      label: sceneLabel(el),
      shape: shapeOf(el.kind),
      parent: el.parent === null ? null : brand<string, "SceneNodeId">(el.parent),
      icon: null,
      rows: null,
      rowDivider: null,
    });
  }

  const edges: SceneEdge[] = [];
  for (const rel of ast.rels) {
    const from = boxes.get(rel.from);
    const to = boxes.get(rel.to);
    if (from === undefined || to === undefined) {
      return err({
        kind: "layout",
        message: `c4: relation ${rel.id} references an unknown element`,
      });
    }
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
      fromEnd: "none",
      toEnd: "arrow",
    });
  }

  let width = 0;
  let height = 0;
  for (const b of boxes.values()) {
    width = Math.max(width, b.x + b.w);
    height = Math.max(height, b.y + b.h);
  }
  return ok({ nodes, edges, extent: rect(0, 0, width, height) });
};
