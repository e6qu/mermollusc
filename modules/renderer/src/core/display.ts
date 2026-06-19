import { coordinate, length, point } from "@m/std";
import type { Coordinate, Length, Point } from "@m/std";
import type { EdgeEnd, IconRef, NodeShape, Scene, SceneNode } from "@m/contracts";

const ICON_SIZE = 20;

export type LabelAlign = "center" | "left";

// A marker polygon's fill: `solid` fills with the stroke colour (a filled arrowhead / UML composition
// diamond); `hollow` fills with the background and outlines in stroke (an inheritance triangle / UML
// aggregation diamond), so it reads as an open shape over whatever it overlaps.
export type MarkerFill = "solid" | "hollow";

export interface MarkerPolygon {
  readonly points: readonly Point[];
  readonly fill: MarkerFill;
}

// The drawn form of one edge end (an arrowhead, a UML class head, or a crow's-foot cardinality),
// pre-computed in the core as backend-agnostic primitives so the canvas painter and the SVG backend
// render identical glyphs: `lines` are stroked segments (bars, crow's-foot prongs, an open-arrow V),
// `polygons` are filled/hollow heads (arrowhead, triangle, diamonds), `circle` a hollow "zero" ring.
// All in absolute scene coordinates. Every field is present (empty/null when unused).
export interface EndMarker {
  readonly lines: readonly (readonly [Point, Point])[];
  readonly polygons: readonly MarkerPolygon[];
  readonly circle: { readonly center: Point; readonly radius: number } | null;
}

export type DrawCmd =
  | {
      readonly kind: "box";
      readonly x: Coordinate;
      readonly y: Coordinate;
      readonly width: Length;
      readonly height: Length;
      readonly radius: Length;
    }
  | {
      readonly kind: "diamond";
      readonly cx: Coordinate;
      readonly cy: Coordinate;
      readonly width: Length;
      readonly height: Length;
    }
  | {
      readonly kind: "polyline";
      readonly points: readonly Point[];
      readonly dashed: boolean;
      readonly fromMarker: EndMarker;
      readonly toMarker: EndMarker;
    }
  | {
      readonly kind: "icon";
      readonly ref: IconRef;
      readonly x: Coordinate;
      readonly y: Coordinate;
      readonly size: Length;
    }
  | {
      readonly kind: "label";
      readonly x: Coordinate;
      readonly y: Coordinate;
      readonly text: string;
      readonly align: LabelAlign;
    };

const EMPTY_MARKER: EndMarker = { lines: [], polygons: [], circle: null };

const ARROW_LEN = 9;
const ARROW_HALF = 3.6;
const TRIANGLE_LEN = 14;
const TRIANGLE_HALF = 8;
const DIAMOND_LEN = 18;
const DIAMOND_HALF = 6;
const MARKER_LEN = 15;
const MARKER_HALF = 6;
const CIRCLE_R = 4.5;

// Geometry of one edge end. `nodePt` sits on the node boundary; `away` is the unit vector pointing
// back along the edge (away from that node). Markers are laid out at increasing distances from the
// node: arrowheads/UML heads (filled or open), perpendicular bars (each `|` = "exactly one"), a
// crow's-foot fan (three prongs = "many"), and a ring (the "zero / optional" circle).
const endMarker = (end: EdgeEnd, nodePt: Point, away: Point): EndMarker => {
  const px = -away.y;
  const py = away.x;
  const at = (dist: number, perp: number): Point =>
    point(nodePt.x + away.x * dist + px * perp, nodePt.y + away.y * dist + py * perp);
  const bar = (dist: number): readonly [Point, Point] => [
    at(dist, MARKER_HALF),
    at(dist, -MARKER_HALF),
  ];
  const foot = (): readonly (readonly [Point, Point])[] => {
    const apex = at(MARKER_LEN, 0);
    return [
      [apex, at(0, MARKER_HALF)],
      [apex, nodePt],
      [apex, at(0, -MARKER_HALF)],
    ];
  };
  const head = (len: number, half: number, fill: MarkerFill): EndMarker => ({
    lines: [],
    polygons: [{ points: [at(len, half), nodePt, at(len, -half)], fill }],
    circle: null,
  });
  const diamond = (fill: MarkerFill): EndMarker => ({
    lines: [],
    polygons: [
      {
        points: [
          nodePt,
          at(DIAMOND_LEN / 2, DIAMOND_HALF),
          at(DIAMOND_LEN, 0),
          at(DIAMOND_LEN / 2, -DIAMOND_HALF),
        ],
        fill,
      },
    ],
    circle: null,
  });
  switch (end) {
    case "none":
      return EMPTY_MARKER;
    case "arrow":
      return head(ARROW_LEN, ARROW_HALF, "solid");
    case "arrowOpen":
      return {
        lines: [
          [at(ARROW_LEN, ARROW_HALF), nodePt],
          [at(ARROW_LEN, -ARROW_HALF), nodePt],
        ],
        polygons: [],
        circle: null,
      };
    case "triangle":
      return head(TRIANGLE_LEN, TRIANGLE_HALF, "hollow");
    case "diamondFilled":
      return diamond("solid");
    case "diamondHollow":
      return diamond("hollow");
    case "one":
      return { lines: [bar(8), bar(14)], polygons: [], circle: null };
    case "zeroOrOne":
      return { lines: [bar(9)], polygons: [], circle: { center: at(18, 0), radius: CIRCLE_R } };
    case "oneOrMany":
      return { lines: [bar(MARKER_LEN + 6), ...foot()], polygons: [], circle: null };
    case "zeroOrMany":
      return {
        lines: foot(),
        polygons: [],
        circle: { center: at(MARKER_LEN + 6, 0), radius: CIRCLE_R },
      };
  }
};

// Unit vector from `b` toward `a`; falls back to +x for a degenerate (zero-length) segment so a
// collapsed waypoint pair never yields NaN coordinates.
const awayUnit = (a: Point, b: Point): Point => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? point(1, 0) : point(dx / len, dy / len);
};

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

// Title band height of an ER entity box; the rest is `ROW_H` per attribute row. Mirrors the layout's
// ER_TITLE_H / ER_ROW_H so the divider and rows land on the boundaries the box was sized for.
const ROW_TITLE_H = 30;
const ROW_H = 20;
const ROW_INSET = 8;

const nodeCmds = (node: SceneNode): DrawCmd[] => {
  const { origin, size } = node.bounds;
  const cx = coordinate(origin.x + size.width / 2);
  const cy = coordinate(origin.y + size.height / 2);
  const label = {
    kind: "label",
    x: cx,
    y: cy,
    text: node.label,
    align: "center",
  } satisfies DrawCmd;
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
        radius: length(4),
      },
      { kind: "label", x: cx, y: coordinate(origin.y + 12), text: node.label, align: "center" },
    ];
  }
  const box = {
    kind: "box",
    x: origin.x,
    y: origin.y,
    width: size.width,
    height: size.height,
    radius: length(cornerRadius(node.shape, size.width, size.height)),
  } satisfies DrawCmd;
  if (node.rows !== null) {
    // A compartment box (ER entity / UML class): title in the top band, a divider, then one
    // left-aligned row per member. A class also gets an inner divider at `rowDivider` (field/method).
    const cmds: DrawCmd[] = [
      box,
      {
        kind: "label",
        x: cx,
        y: coordinate(origin.y + ROW_TITLE_H / 2),
        text: node.label,
        align: "center",
      },
      dividerAt(origin.x, origin.y + ROW_TITLE_H, size.width),
    ];
    for (const [i, row] of node.rows.entries()) {
      cmds.push({
        kind: "label",
        x: coordinate(origin.x + ROW_INSET),
        y: coordinate(origin.y + ROW_TITLE_H + ROW_H * i + ROW_H / 2),
        text: row,
        align: "left",
      });
    }
    if (node.rowDivider !== null && node.rowDivider > 0 && node.rowDivider < node.rows.length) {
      cmds.push(dividerAt(origin.x, origin.y + ROW_TITLE_H + ROW_H * node.rowDivider, size.width));
    }
    return cmds;
  }
  if (node.icon === null) return [box, label];
  // With an icon, stack the glyph above the label rather than centring the text on the box.
  return [
    box,
    {
      kind: "icon",
      ref: node.icon,
      x: coordinate(origin.x + size.width / 2 - ICON_SIZE / 2),
      y: coordinate(origin.y + 6),
      size: length(ICON_SIZE),
    },
    {
      kind: "label",
      x: cx,
      y: coordinate(origin.y + 6 + ICON_SIZE + 6),
      text: node.label,
      align: "center",
    },
  ];
};

// A horizontal rule across a box (the ER title/row separator), drawn as a markerless polyline.
const dividerAt = (x: number, y: number, width: number): DrawCmd => ({
  kind: "polyline",
  points: [point(x, y), point(x + width, y)],
  dashed: false,
  fromMarker: EMPTY_MARKER,
  toMarker: EMPTY_MARKER,
});

const LABEL_GAP = 11;

// Anchor an edge label at the midpoint *along the routed polyline*, nudged perpendicular to the
// local segment. The straight average of the endpoints can land inside a node when an orthogonal
// edge bends around one (e.g. a flowchart branch that routes down the side); the on-path midpoint
// stays in the routing channel ELK keeps clear, and the perpendicular nudge keeps the stroke from
// running through the text.
export const edgeLabelAnchor = (
  points: readonly Point[],
): { readonly x: Coordinate; readonly y: Coordinate } => {
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
        x: coordinate(a.x + (b.x - a.x) * t + nx * LABEL_GAP),
        y: coordinate(a.y + (b.y - a.y) * t + ny * LABEL_GAP),
      };
    }
    remaining -= segLen;
  }
  const first = points[0];
  return first === undefined
    ? { x: coordinate(0), y: coordinate(0) }
    : { x: coordinate(first.x), y: coordinate(first.y) };
};

export const toDisplayList = (scene: Scene): DrawCmd[] => {
  const cmds: DrawCmd[] = [];
  for (const node of scene.nodes) cmds.push(...nodeCmds(node));
  for (const edge of scene.edges) {
    const pts = edge.waypoints;
    if (pts.length < 2) continue;
    const first = pts[0];
    const second = pts[1];
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const fromMarker =
      first === undefined || second === undefined
        ? EMPTY_MARKER
        : endMarker(edge.fromEnd, first, awayUnit(second, first));
    const toMarker =
      last === undefined || prev === undefined
        ? EMPTY_MARKER
        : endMarker(edge.toEnd, last, awayUnit(prev, last));
    cmds.push({
      kind: "polyline",
      points: pts,
      dashed: edge.stroke === "dashed",
      fromMarker,
      toMarker,
    });
    if (edge.label !== null) {
      const anchor = edgeLabelAnchor(pts);
      cmds.push({ kind: "label", x: anchor.x, y: anchor.y, text: edge.label, align: "center" });
    }
  }
  return cmds;
};
