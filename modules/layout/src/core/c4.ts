import { err, ok, point, rect, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
import { spreadPorts } from "./route.js";
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
import { optimalMountPoints } from "./route.js";
import { clampedWidth, selfLoopWaypoints, selfLoopLabelPos } from "./measure.js";

const PADDING = 16;
const HEADER = 26; // space at the top of a boundary for its label
const GAP = 64; // generous, so edge labels on the short inter-node segments have room to clear
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

const leafWidth = (label: string, measure: MeasureText): number =>
  clampedWidth(label, measure, MIN_LEAF_WIDTH, LABEL_PADDING);

const shapeOf = (kind: C4ElementKind): NodeShape =>
  kind === "boundary" ? "container" : kind === "person" ? "round" : "rect";

// Pure recursive nested-box layout: boundaries wrap their children (sized to fit), siblings sit
// in a row, relations are straight centre-to-centre edges. No ELK — coordinates are absolute.
export const layoutC4 = (ast: C4Ast, measure: MeasureText): Result<Scene, LayoutError> => {
  // Ids must be unique: a SceneNodeId keys selection and the box map, and a duplicate that nests
  // inside its twin makes the `childrenOf`-keyed `place` recursion re-enter the same bucket forever
  // (a stack overflow). Reject loudly instead of letting the recursion blow the stack.
  const ids = new Set<C4ElementId>();
  for (const el of ast.elements) {
    if (ids.has(el.id)) {
      return err({ kind: "layout", message: `c4: duplicate element id ${el.id}` });
    }
    ids.add(el.id);
  }

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
    const columns = Math.max(1, Math.ceil(Math.sqrt(kids.length)));
    let rowX = x + PADDING;
    let rowY = y + HEADER;
    let rowH = 0;
    let maxRight = x + PADDING;
    let maxBottom = rowY;
    for (const [idx, kid] of kids.entries()) {
      if (idx > 0 && idx % columns === 0) {
        rowX = x + PADDING;
        rowY += rowH + GAP;
        rowH = 0;
      }
      const kidBox = place(kid, rowX, rowY);
      rowX += kidBox.w + GAP;
      rowH = Math.max(rowH, kidBox.h);
      maxRight = Math.max(maxRight, kidBox.x + kidBox.w);
      maxBottom = Math.max(maxBottom, kidBox.y + kidBox.h);
    }
    const box: Box = { x, y, w: maxRight - x + PADDING, h: maxBottom - y + PADDING };
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
      id: sceneNodeId(el.id),
      bounds: rect(b.x, b.y, b.w, b.h),
      label: sceneLabel(el),
      shape: shapeOf(el.kind),
      parent: el.parent === null ? null : sceneNodeId(el.parent),
      icon: null,
      rows: null,
      rowDivider: null,
      subtitle: null,
      accent: "none",
      role: "normal",
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
    const isSelf = rel.from === rel.to;
    edges.push({
      id: sceneEdgeId(rel.id),
      from: sceneNodeId(rel.from),
      to: sceneNodeId(rel.to),
      waypoints: isSelf ? selfLoopWaypoints(from) : optimalMountPoints(from, to),
      label: rel.label === "" ? null : rel.label,
      stroke: "solid",
      fromEnd: "none",
      toEnd: "arrow",
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos:
        rel.label === ""
          ? null
          : isSelf
            ? selfLoopLabelPos(from)
            : point(
                (from.x + from.w / 2 + to.x + to.w / 2) / 2,
                (from.y + from.h / 2 + to.y + to.h / 2) / 2,
              ),
    });
  }

  let width = 0;
  let height = 0;
  for (const b of boxes.values()) {
    width = Math.max(width, b.x + b.w);
    height = Math.max(height, b.y + b.h);
  }
  // Spread connectors into per-side lanes so links sharing a node don't stack into one line.
  return ok(
    spreadPorts({ nodes, edges, wedges: [], decorations: [], extent: rect(0, 0, width, height) }),
  );
};
