import { coordinate, length, point } from "@m/std";
import type { Coordinate, Length, Point } from "@m/std";
import type {
  BandFill,
  Decoration,
  EdgeEnd,
  IconRef,
  NodeAccent,
  NodeShape,
  Scene,
  SceneNode,
  SceneWedge,
} from "@m/contracts";

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
      // Semantic fill accent (a node's `accent`); `none` draws the ordinary node fill.
      readonly accent: NodeAccent;
    }
  | {
      readonly kind: "stateStart";
      readonly cx: Coordinate;
      readonly cy: Coordinate;
      readonly radius: Length;
    }
  | {
      readonly kind: "stateEnd";
      readonly cx: Coordinate;
      readonly cy: Coordinate;
      readonly radius: Length;
    }
  | {
      readonly kind: "stateBar";
      readonly x: Coordinate;
      readonly y: Coordinate;
      readonly width: Length;
      readonly height: Length;
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
      // Draw as a smooth bezier bowed along the dominant axis (a 2-point mindmap/gitGraph connector)
      // rather than straight segments. Markers are unused on curved edges (they're arrowless).
      readonly curved: boolean;
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
      // Draw a background plate behind the text (edge labels), so the routed line/markers don't
      // strike through it. Node/title/row labels sit on a filled box already and set this false.
      readonly plate: boolean;
    }
  | {
      // A filled background rectangle (no stroke, no label) drawn behind the content — a Gantt section
      // stripe or an excluded-day column. The painter fills it theme-aware from `fill`.
      readonly kind: "band";
      readonly x: Coordinate;
      readonly y: Coordinate;
      readonly width: Length;
      readonly height: Length;
      readonly fill: BandFill;
    }
  | {
      // A filled pie slice. Angles are in canvas convention (radians from +x, clockwise); the painter
      // fills with `wedgeColor(colorIndex)` so both backends share the categorical palette.
      readonly kind: "wedge";
      readonly cx: Coordinate;
      readonly cy: Coordinate;
      readonly radius: Length;
      readonly innerRadius: Length;
      readonly startAngle: number;
      readonly endAngle: number;
      readonly colorIndex: number;
    };

// Categorical palette for pie slices, cycled by `colorIndex`. Shared by the canvas and SVG backends so
// a slice is the same colour in both. Chosen for legibility on the light and dark canvas backgrounds.
const WEDGE_PALETTE: readonly [string, ...string[]] = [
  "#4e79a7",
  "#f28e2b",
  "#59a14f",
  "#e15759",
  "#b07aa1",
  "#76b7b2",
  "#edc948",
  "#ff9da7",
  "#9c755f",
  "#bab0ac",
];

export const wedgeColor = (index: number): string => {
  const c =
    WEDGE_PALETTE[((index % WEDGE_PALETTE.length) + WEDGE_PALETTE.length) % WEDGE_PALETTE.length];
  // The modulo is always in range; `WEDGE_PALETTE[0]` is the tuple's definite first slot (not a copied
  // literal), so this names the single source of truth rather than duplicating a colour.
  return c ?? WEDGE_PALETTE[0];
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

// Two cubic-bezier control points for a smooth curve from `a` to `b`, bowed along the dominant axis
// (the curve leaves `a` and arrives `b` parallel to that axis — an S-curve). Shared by the canvas and
// SVG backends so a curved edge looks identical in both. Used for mindmap spokes / gitGraph connectors.
export const bezierControls = (a: Point, b: Point): readonly [Point, Point] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return [point(a.x + dx * 0.5, a.y), point(b.x - dx * 0.5, b.y)];
  }
  return [point(a.x, a.y + dy * 0.5), point(b.x, b.y - dy * 0.5)];
};

// A smooth cubic-bezier spline through every waypoint (Catmull-Rom → bezier), so a multi-segment routed
// edge can render as one flowing curve instead of straight dog-legs, while still ending exactly on the
// last waypoint (the arrowhead stays put). Each segment carries the two control points + its endpoint;
// the path starts at `points[0]`. Endpoints are duplicated so the curve doesn't overshoot at the ends.
export interface CurveSegment {
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}
export const smoothSegments = (points: readonly Point[]): readonly CurveSegment[] => {
  const segs: CurveSegment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];
    if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) continue;
    segs.push({
      c1: point(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6),
      c2: point(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6),
      to: point(p2.x, p2.y),
    });
  }
  return segs;
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
const NOTE_FOLD = 14;
// Extra title-band height for a `SceneNode.subtitle` (a class `«stereotype»`); mirrors the layout's
// CLASS_SUBTITLE_H so the divider and rows still land on the boundaries the box was sized for.
const SUBTITLE_H = 16;

const nodeCmds = (node: SceneNode): DrawCmd[] => {
  // A marker node is an invisible hit/selection region (its visual — e.g. a pie wedge — is drawn
  // elsewhere); emit nothing for it.
  if (node.role === "marker") return [];
  const { origin, size } = node.bounds;
  const cx = coordinate(origin.x + size.width / 2);
  const cy = coordinate(origin.y + size.height / 2);
  const label = {
    kind: "label",
    x: cx,
    y: cy,
    text: node.label,
    align: "center",
    plate: false,
  } satisfies DrawCmd;
  if (node.role === "stateStart") {
    return [
      {
        kind: "stateStart",
        cx,
        cy,
        radius: length(Math.min(size.width, size.height) / 2),
      },
    ];
  }
  if (node.role === "stateEnd") {
    return [
      {
        kind: "stateEnd",
        cx,
        cy,
        radius: length(Math.min(size.width, size.height) / 2),
      },
    ];
  }
  if (node.role === "stateFork" || node.role === "stateJoin") {
    return [
      {
        kind: "stateBar",
        x: origin.x,
        y: origin.y,
        width: size.width,
        height: size.height,
      },
    ];
  }
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
        accent: "none",
      },
      {
        kind: "label",
        x: cx,
        y: coordinate(origin.y + 12),
        text: node.label,
        align: "center",
        plate: false,
      },
    ];
  }
  const box = {
    kind: "box",
    x: origin.x,
    y: origin.y,
    width: size.width,
    height: size.height,
    radius: length(cornerRadius(node.shape, size.width, size.height)),
    accent: node.accent,
  } satisfies DrawCmd;
  if (node.role === "stateNote") {
    const fold = Math.min(NOTE_FOLD, size.width / 5, size.height / 4);
    return [
      box,
      {
        kind: "polyline",
        points: [
          point(origin.x + size.width - fold, origin.y),
          point(origin.x + size.width - fold, origin.y + fold),
          point(origin.x + size.width, origin.y + fold),
        ],
        dashed: false,
        fromMarker: EMPTY_MARKER,
        toMarker: EMPTY_MARKER,
        curved: false,
      },
      label,
    ];
  }
  if (node.rows !== null) {
    // A compartment box (ER entity / UML class): an optional `«stereotype»` subtitle, the title, a
    // divider, then one left-aligned row per member. A class also gets an inner divider at
    // `rowDivider` (field/method). The subtitle widens the title band so it doesn't crowd the name.
    const subH = node.subtitle === null ? 0 : SUBTITLE_H;
    const titleBand = ROW_TITLE_H + subH;
    const cmds: DrawCmd[] = [box];
    if (node.subtitle !== null) {
      cmds.push({
        kind: "label",
        x: cx,
        y: coordinate(origin.y + SUBTITLE_H / 2 + 2),
        text: node.subtitle,
        align: "center",
        plate: false,
      });
    }
    cmds.push(
      {
        kind: "label",
        x: cx,
        y: coordinate(origin.y + subH + ROW_TITLE_H / 2),
        text: node.label,
        align: "center",
        plate: false,
      },
      dividerAt(origin.x, origin.y + titleBand, size.width),
    );
    for (const [i, row] of node.rows.entries()) {
      cmds.push({
        kind: "label",
        x: coordinate(origin.x + ROW_INSET),
        y: coordinate(origin.y + titleBand + ROW_H * i + ROW_H / 2),
        text: row,
        align: "left",
        plate: false,
      });
    }
    if (node.rowDivider !== null && node.rowDivider > 0 && node.rowDivider < node.rows.length) {
      cmds.push(dividerAt(origin.x, origin.y + titleBand + ROW_H * node.rowDivider, size.width));
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
      plate: false,
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
  curved: false,
});

const END_LABEL_INSET = 18; // distance from the endpoint, along the edge, for a per-end label
const END_LABEL_NUDGE = 9; // perpendicular offset so it clears the line

// A small label just inside `end` (the endpoint), offset toward `toward` (the next waypoint) and
// nudged perpendicular — for a class relationship's per-end multiplicity.
const endLabel = (text: string, end: Point, toward: Point): DrawCmd => {
  const u = awayUnit(toward, end); // unit vector from `end` toward the next point
  return {
    kind: "label",
    x: coordinate(end.x + u.x * END_LABEL_INSET - u.y * END_LABEL_NUDGE),
    y: coordinate(end.y + u.y * END_LABEL_INSET + u.x * END_LABEL_NUDGE),
    text,
    align: "center",
    plate: true,
  };
};

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

// Three layers, back to front: edge lines + end markers, then nodes, then edge labels. Edges under
// nodes means a straight centre-to-centre link (network/cloud/block) is cleanly occluded by any node
// it crosses, rather than slicing visibly across the box; edge labels ride on top (with their plate)
// so they stay readable even when an edge passes close to a node.
export const toDisplayList = (scene: Scene): DrawCmd[] => {
  const edges: DrawCmd[] = [];
  const labels: DrawCmd[] = [];
  for (const edge of scene.edges) {
    const pts = edge.waypoints;
    // `waypoints` is `TwoOrMore`, so the first two points are always present (no length guard needed).
    const first = pts[0];
    const second = pts[1];
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const fromMarker = endMarker(edge.fromEnd, first, awayUnit(second, first));
    const toMarker =
      last === undefined || prev === undefined
        ? EMPTY_MARKER
        : endMarker(edge.toEnd, last, awayUnit(prev, last));
    edges.push({
      kind: "polyline",
      points: pts,
      dashed: edge.stroke === "dashed",
      fromMarker,
      toMarker,
      curved: edge.curved,
    });
    if (edge.label !== null) {
      // A router that reserved space for the label (ELK) supplies its centre; otherwise derive it from
      // the routed midpoint.
      const anchor = edge.labelPos ?? edgeLabelAnchor(pts);
      labels.push({
        kind: "label",
        x: anchor.x,
        y: anchor.y,
        text: edge.label,
        align: "center",
        plate: true,
      });
    }
    // Per-end labels (class multiplicity) sit just inside each endpoint, offset along the first/last
    // segment and nudged perpendicular so they clear the line.
    if (edge.fromLabel !== null) {
      labels.push(endLabel(edge.fromLabel, first, second));
    }
    if (edge.toLabel !== null && last !== undefined && prev !== undefined) {
      labels.push(endLabel(edge.toLabel, last, prev));
    }
  }
  // Container nodes (subgraph / boundary backgrounds) draw *behind* the edges, so an edge between two
  // members inside a subgraph isn't hidden by the container's fill; leaf nodes draw in front of the
  // edges so a link is cleanly occluded by any box it crosses.
  const containers = scene.nodes.filter((n) => n.shape === "container").flatMap(nodeCmds);
  const leaves = scene.nodes.filter((n) => n.shape !== "container").flatMap(nodeCmds);
  const wedges = scene.wedges.flatMap(wedgeCmds);
  const decorations = scene.decorations.map(decorationCmd);
  // Decorations (axis chrome) draw first, behind everything else.
  return [...decorations, ...containers, ...wedges, ...edges, ...leaves, ...labels];
};

// Axis chrome → draw commands: a `band` is a filled background rect; a `rule` is a markerless dashed
// polyline (a guide line); a `caption` is a plain (plateless) label. Exhaustive over `Decoration`.
const decorationCmd = (d: Decoration): DrawCmd => {
  switch (d.kind) {
    case "band":
      return {
        kind: "band",
        x: d.bounds.origin.x,
        y: d.bounds.origin.y,
        width: d.bounds.size.width,
        height: d.bounds.size.height,
        fill: d.fill,
      };
    case "rule":
      return {
        kind: "polyline",
        points: [d.from, d.to],
        dashed: true,
        fromMarker: EMPTY_MARKER,
        toMarker: EMPTY_MARKER,
        curved: false,
      };
    case "caption":
      return { kind: "label", x: d.at.x, y: d.at.y, text: d.text, align: d.align, plate: false };
  }
};

const FULL_CIRCLE = Math.PI * 2 - 1e-6;
const LEGEND_LABEL_GAP = 8;

// A wedge renders one of two things, distinguished by its sweep:
//   - a *slice* (partial sweep): the filled sector with its share as a centred `NN%` label part-way
//     out along the mid-angle (on a plate, so it stays legible over the fill);
//   - a *legend swatch* (a full circle): a small colour disc with its `label` (the slice name, plus
//     the raw value when `showData`) drawn to its right, left-aligned.
const wedgeCmds = (wedge: SceneWedge): DrawCmd[] => {
  const cmd: DrawCmd = {
    kind: "wedge",
    cx: coordinate(wedge.center.x),
    cy: coordinate(wedge.center.y),
    radius: length(wedge.radius),
    innerRadius: length(wedge.innerRadius),
    startAngle: wedge.startAngle,
    endAngle: wedge.endAngle,
    colorIndex: wedge.colorIndex,
  };
  if (wedge.endAngle - wedge.startAngle >= FULL_CIRCLE) {
    return [
      cmd,
      {
        kind: "label",
        x: coordinate(wedge.center.x + wedge.radius + LEGEND_LABEL_GAP),
        y: coordinate(wedge.center.y),
        text: wedge.label,
        align: "left",
        plate: false,
      },
    ];
  }
  const mid = (wedge.startAngle + wedge.endAngle) / 2;
  const lr = wedge.radius * 0.62;
  return [
    cmd,
    {
      kind: "label",
      x: coordinate(wedge.center.x + lr * Math.cos(mid)),
      y: coordinate(wedge.center.y + lr * Math.sin(mid)),
      text: `${Math.round(wedge.percent)}%`,
      align: "center",
      plate: true,
    },
  ];
};
