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
import { buildEdgePath, edgeCrossings, edgeLabelAnchorAt } from "./path.js";
import type { PathCmd } from "./path.js";

export { bezierControls, roundedCorners, smoothSegments } from "./path.js";
export { edgeLabelAnchorAt, pathRatioNearest } from "./path.js";
export type { PathCmd } from "./path.js";

const ICON_SIZE = 20;

export type LabelAlign = "center" | "left";

export const labelLines = (text: string): readonly string[] => text.split(/\n|\\n/g);

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
      // A UML-style stickman (head, body, arms, legs) drawn to fit the box — a person/actor.
      readonly kind: "actor";
      readonly x: Coordinate;
      readonly y: Coordinate;
      readonly width: Length;
      readonly height: Length;
    }
  | {
      readonly kind: "polyline";
      readonly points: readonly Point[];
      readonly dashed: boolean;
      readonly fromMarker: EndMarker;
      readonly toMarker: EndMarker;
      // Small open chevrons, one per segment, pointing in the direction of flow — so a directed edge's
      // direction is legible on every leg of a multi-bend orthogonal route, not just at its head. Empty
      // for undirected/curved edges. Drawn exactly like the end markers (same lines, same stroke).
      readonly midMarkers: readonly EndMarker[];
      // Draw as a smooth bezier bowed along the dominant axis (a 2-point mindmap/gitGraph connector)
      // rather than straight segments. Markers are unused on curved edges (they're arrowless).
      readonly curved: boolean;
      readonly path: readonly PathCmd[];
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
      // How to render the text against the diagram:
      //  "node"    — full-opacity text on its own filled box (node / title / row / decoration labels).
      //  "edge"    — 75%-opacity text, NO background (a horizontal edge label lifted above its line).
      //  "edge-masked" — 75%-opacity text on a small OPAQUE plate masking the line (a vertical edge
      //             label kept in the channel, so it doesn't consume horizontal space by dodging aside).
      readonly labelStyle: "node" | "edge" | "edge-masked";
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
    }
  | {
      // A bus junction: a small dot filled in the stroke colour, marking where edges branch off a shared
      // backbone in the opt-in bus rendering. Only emitted when `toDisplayList` is asked for junctions.
      readonly kind: "junction";
      readonly cx: Coordinate;
      readonly cy: Coordinate;
      readonly radius: Length;
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

// Edge ends that denote a flow DIRECTION (an arrowhead), as opposed to ER/UML cardinality glyphs
// (bars, crow's feet, the "zero" ring) which don't. Only directed edges get per-segment hints.
const DIRECTIONAL_ENDS: ReadonlySet<EdgeEnd> = new Set(["arrow", "arrowOpen", "triangle"]);
const HINT_LEN = 7; // length of a mid-segment direction chevron, along the flow
const HINT_HALF = 4; // half-width of its open "V"
const HINT_MIN_SEG = 18; // skip segments shorter than this — no room for a readable chevron

// A small open chevron centred on `mid`, opening toward `flow` (a unit vector) — the lightweight "this way"
// hint placed on each segment of a directed edge. Same `lines` shape as `arrowOpen`, so the backends draw
// it with the existing marker path and it inherits the edge's stroke colour.
const directionHint = (mid: Point, flow: Point): EndMarker => {
  const px = -flow.y;
  const py = flow.x;
  const apex = point(mid.x + flow.x * (HINT_LEN / 2), mid.y + flow.y * (HINT_LEN / 2));
  const tail = (perp: number): Point =>
    point(mid.x - flow.x * (HINT_LEN / 2) + px * perp, mid.y - flow.y * (HINT_LEN / 2) + py * perp);
  return {
    lines: [
      [tail(HINT_HALF), apex],
      [tail(-HINT_HALF), apex],
    ],
    polygons: [],
    circle: null,
  };
};

// One chevron per segment of a directed, straight (non-curved) edge, pointing the way flow travels:
// toward the target when the head is at the target end, toward the source when it's reversed. Undirected
// or curved edges get none.
const directionHints = (
  points: readonly Point[],
  fromEnd: EdgeEnd,
  toEnd: EdgeEnd,
  curved: boolean,
): readonly EndMarker[] => {
  const forward = DIRECTIONAL_ENDS.has(toEnd);
  const backward = !forward && DIRECTIONAL_ENDS.has(fromEnd);
  if (curved || (!forward && !backward)) return [];
  const hints: EndMarker[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    if (Math.hypot(b.x - a.x, b.y - a.y) < HINT_MIN_SEG) continue;
    const mid = point((a.x + b.x) / 2, (a.y + b.y) / 2);
    hints.push(directionHint(mid, forward ? awayUnit(b, a) : awayUnit(a, b)));
  }
  return hints;
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
    case "actor":
      return 0;
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
    labelStyle: "node",
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
  if (node.shape === "actor") {
    // A stickman filling the upper part of the box, with its label on the bottom row.
    return [
      { kind: "actor", x: origin.x, y: origin.y, width: size.width, height: size.height },
      {
        kind: "label",
        x: cx,
        y: coordinate(origin.y + size.height - 8),
        text: node.label,
        align: "center",
        labelStyle: "node",
      },
    ];
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
        accent: node.accent,
      },
      {
        kind: "label",
        x: cx,
        y: coordinate(origin.y + 12),
        text: node.label,
        align: "center",
        labelStyle: "node",
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
        midMarkers: [],
        curved: false,
        path: [
          { kind: "moveTo", x: origin.x + size.width - fold, y: origin.y },
          { kind: "lineTo", x: origin.x + size.width - fold, y: origin.y + fold },
          { kind: "lineTo", x: origin.x + size.width, y: origin.y + fold },
        ],
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
        labelStyle: "node",
      });
    }
    cmds.push(
      {
        kind: "label",
        x: cx,
        y: coordinate(origin.y + subH + ROW_TITLE_H / 2),
        text: node.label,
        align: "center",
        labelStyle: "node",
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
        labelStyle: "node",
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
      labelStyle: "node",
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
  midMarkers: [],
  curved: false,
  path: [
    { kind: "moveTo", x, y },
    { kind: "lineTo", x: x + width, y },
  ],
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
    labelStyle: "edge-masked",
  };
};

// Anchor an edge label at the midpoint *along the routed polyline*, nudged perpendicular to the
// local segment. The straight average of the endpoints can land inside a node when an orthogonal
// edge bends around one (e.g. a flowchart branch that routes down the side); the on-path midpoint
// stays in the routing channel ELK keeps clear, and the perpendicular nudge keeps the stroke from
// running through the text.
export const edgeLabelAnchor = (
  points: readonly Point[],
): { readonly x: Coordinate; readonly y: Coordinate } => {
  const anchor = edgeLabelAnchorAt(points, 0.5);
  return { x: coordinate(anchor.x), y: coordinate(anchor.y) };
};

// Squared distance from p to the segment a–b.
const segDistSq = (px: number, py: number, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
};

// Resolve an edge label against its own line, by the orientation of the segment it LIES ON (nearest by
// point-to-segment distance — a short perpendicular stub's midpoint can be closer than the run the
// label sits on). A HORIZONTAL run lifts the label above the line (`masked: false`, no plate, no wasted
// vertical space). A VERTICAL run leaves it in place and asks for a masking plate (`masked: true`) so
// the text sits in the channel without dodging sideways. `LABEL_LINE_CLEARANCE` = half the 16px label
// box + a gap, enough that descenders never touch the line.
const LABEL_LINE_CLEARANCE = 16;
const labelVsLine = (
  x: number,
  y: number,
  pts: readonly Point[],
): { readonly x: number; readonly y: number; readonly masked: boolean } => {
  let best: { readonly a: Point; readonly b: Point } | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a === undefined || b === undefined) continue;
    const d = segDistSq(x, y, a, b);
    if (d < bestD) {
      bestD = d;
      best = { a, b };
    }
  }
  if (best === null) return { x, y, masked: false };
  return Math.abs(best.b.x - best.a.x) >= Math.abs(best.b.y - best.a.y)
    ? { x, y: y - LABEL_LINE_CLEARANCE, masked: false }
    : { x, y, masked: true };
};

const JUNCTION_R = 3.2; // radius of a bus-junction dot
const SEG_EPS = 0.5; // axis-alignment / same-track tolerance for junction detection

// Is `p` strictly inside the axis-aligned segment a–b — on its line, between the ends, not at them?
const pointInsideSegment = (p: Point, a: Point, b: Point): boolean => {
  if (Math.abs(a.x - b.x) <= SEG_EPS)
    return (
      Math.abs(p.x - a.x) <= 1 &&
      p.y > Math.min(a.y, b.y) + SEG_EPS &&
      p.y < Math.max(a.y, b.y) - SEG_EPS
    );
  if (Math.abs(a.y - b.y) <= SEG_EPS)
    return (
      Math.abs(p.y - a.y) <= 1 &&
      p.x > Math.min(a.x, b.x) + SEG_EPS &&
      p.x < Math.max(a.x, b.x) - SEG_EPS
    );
  return false;
};

// Do two axis-aligned segments lie on the SAME line (same orientation, same track)?
const sameLine = (a0: Point, a1: Point, b0: Point, b1: Point): boolean => {
  const aVertical = Math.abs(a0.x - a1.x) <= SEG_EPS;
  if (aVertical !== Math.abs(b0.x - b1.x) <= SEG_EPS) return false;
  return aVertical ? Math.abs(a0.x - b0.x) <= 1 : Math.abs(a0.y - b0.y) <= 1;
};

// Bus junctions (opt-in): a dot where one edge branches off a backbone another edge continues along — a
// waypoint P of edge A that sits inside a segment S of edge B, with one of A's segments at P running
// collinear with S (A ran along B's line, then turned off here). A plain crossing isn't collinear, so it
// is not marked. Deduped to one dot per location.
const busJunctions = (scene: Scene): DrawCmd[] => {
  const routes = scene.edges.map((e) => e.waypoints);
  const out: DrawCmd[] = [];
  const seen = new Set<string>();
  for (let a = 0; a < routes.length; a++) {
    const wa = routes[a];
    if (wa === undefined) continue;
    for (let i = 0; i < wa.length; i++) {
      const p = wa[i];
      if (p === undefined) continue;
      const before = i > 0 ? wa[i - 1] : undefined;
      const after = i + 1 < wa.length ? wa[i + 1] : undefined;
      for (let b = 0; b < routes.length; b++) {
        const wb = routes[b];
        if (b === a || wb === undefined) continue;
        let branches = false;
        for (let j = 1; j < wb.length && !branches; j++) {
          const c = wb[j - 1];
          const d = wb[j];
          if (c === undefined || d === undefined || !pointInsideSegment(p, c, d)) continue;
          if (
            (before !== undefined && sameLine(before, p, c, d)) ||
            (after !== undefined && sameLine(p, after, c, d))
          )
            branches = true;
        }
        if (!branches) continue;
        const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ kind: "junction", cx: p.x, cy: p.y, radius: length(JUNCTION_R) });
        }
        break;
      }
    }
  }
  return out;
};

// How classic (Mermaid-parity) mode finishes edges, vs the decorated house look:
// - "decorated": per-segment direction chevrons + crossing hop arcs (the house style).
// - "plain": no decorations; the routed polyline as-is. For families whose lanes are precision-routed
//   around obstacles (the maze-routed box families), where smoothing would cut corners INTO them.
// - "spline": no decorations; a smooth curve through the waypoints — Mermaid's basis-curve look, for
//   the ELK layered family.
export type EdgeFinish = "decorated" | "plain" | "spline";

// Three layers, back to front: edge lines + end markers, then nodes, then edge labels. Edges under
// nodes means a straight centre-to-centre link (network/cloud/block) is cleanly occluded by any node
// it crosses, rather than slicing visibly across the box; edge labels ride on top (with their plate)
// so they stay readable even when an edge passes close to a node. `drawJunctions` (the opt-in bus
// rendering) adds a dot wherever edges branch off a shared backbone, drawn just above the edges.
export const toDisplayList = (
  scene: Scene,
  drawJunctions = false,
  edgeFinish: EdgeFinish = "decorated",
): DrawCmd[] => {
  const crossingsMap = edgeCrossings(scene.edges);

  const edges: DrawCmd[] = [];
  const labels: DrawCmd[] = [];
  for (let idx = 0; idx < scene.edges.length; idx++) {
    const edge = scene.edges[idx];
    if (edge === undefined) continue;
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
      midMarkers:
        edgeFinish === "decorated"
          ? directionHints(pts, edge.fromEnd, edge.toEnd, edge.curved)
          : [],
      curved: edge.curved,
      // "spline" (classic layered) draws rounded-corner orthogonal edges: ELK routes orthogonally and
      // the endpoints are snapped to perpendicular mounts, so rounding the interior corners keeps every
      // edge entering/leaving a node straight and on-centre (a Catmull-Rom spline overshot those right
      // angles into swoops that struck node corners). No crossing hops.
      path:
        edgeFinish === "spline"
          ? buildEdgePath(pts, true, [])
          : buildEdgePath(
              pts,
              edge.curved,
              edgeFinish === "decorated" ? (crossingsMap.get(idx) ?? []) : [],
            ),
    });
    if (edge.label !== null) {
      // The layout decollides the anchor against nodes. Here, at draw time (so no upstream re-routing or
      // caching can drop it), we resolve the label vs its own line by the orientation of the segment it
      // sits on: a HORIZONTAL run lifts the label above the line (transparent — no wasted vertical
      // space); a VERTICAL run keeps it in the channel on a small opaque plate that masks the line (no
      // wasted horizontal space dodging aside).
      const anchor = edge.labelPos ?? edgeLabelAnchor(pts);
      const placed = labelVsLine(anchor.x, anchor.y, pts);
      labels.push({
        kind: "label",
        x: coordinate(placed.x),
        y: coordinate(placed.y),
        text: edge.label,
        align: "center",
        labelStyle: placed.masked ? "edge-masked" : "edge",
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
  const junctions = drawJunctions ? busJunctions(scene) : [];
  return [...decorations, ...containers, ...wedges, ...edges, ...junctions, ...leaves, ...labels];
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
        midMarkers: [],
        curved: false,
        path: [
          { kind: "moveTo", x: d.from.x, y: d.from.y },
          { kind: "lineTo", x: d.to.x, y: d.to.y },
        ],
      };
    case "caption":
      return {
        kind: "label",
        x: d.at.x,
        y: d.at.y,
        text: d.text,
        align: d.align,
        labelStyle: "node",
      };
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
        labelStyle: "node",
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
      labelStyle: "edge-masked",
    },
  ];
};
