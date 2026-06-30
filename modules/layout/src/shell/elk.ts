import {
  assertNever,
  brand,
  decode,
  err,
  map,
  messageOf,
  ok,
  point,
  rect,
  twoOrMore,
  type Point,
  type Rect,
  type Result,
} from "@m/std";
import { boxCenter, routeWaypoints, snapSceneEdgesToMountPoints } from "../core/route.js";
import type {
  ClassAst,
  ClassMember,
  DiagramAst,
  EdgeEnd,
  EdgeStroke,
  ErAst,
  FlowchartAst,
  NodeId,
  NodeShape,
  RequirementAst,
  StateKind,
  Scene,
  SceneEdge,
  SceneNode,
  SceneNodeRole,
  StateNote,
  StateAst,
} from "@m/contracts";
import ELK from "elkjs/lib/elk.bundled.js";
import { z } from "zod";
import {
  layoutBlock,
  layoutC4,
  layoutCloud,
  layoutGantt,
  layoutGitGraph,
  layoutMindmap,
  layoutNetwork,
  layoutPie,
  layoutSequence,
  layoutTimeline,
  decollideEdgeLabels,
  lowestEnergy,
  mazeRerouteEdges,
  minimizeCrossings,
  separateOverlaps,
  styleOk,
  toElkGraph,
  toScene,
  trunkRoutes,
  respreadPorts,
} from "../core/index.js";
import type {
  LayoutConfig,
  LayoutError,
  LayoutGraph,
  LayoutNode,
  MeasureText,
  PositionedGraph,
  PositionedNode,
} from "../core/index.js";

// `elk.bundled.js` runs the layout algorithm in an inlined Web Worker in the browser (and inline on
// the calling thread under Node, where there's no `Worker` — e.g. tests). So `elk.layout` is genuinely
// off the main thread in the app: the heavy graph computation never blocks rendering/interaction.
// (Don't wrap this in another Worker — nesting elk.bundled's inlined worker breaks under bundlers.)
// elk.bundled is ≈1.5 MB; it's eagerly imported (not a dynamic `import()`) so the inlined worker is
// ready before the first layout — deferring it to a fetched async chunk delays first render enough to
// race the app's initial paint. It's the dominant term in the bundle, but irreducible (a single
// transpiled-Java module that can't be split below the chunk-size advisory).
const elk = new ELK();

const PointZ = z.object({ x: z.number(), y: z.number() });
const SectionZ = z.object({
  startPoint: PointZ,
  endPoint: PointZ,
  bendPoints: z.array(PointZ).optional(),
});
// ELK returns child nodes nested under their parent, with coordinates relative to the parent — so
// the schema is recursive and the flattener below resolves absolute positions.
interface ElkNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly children?: readonly ElkNode[] | undefined;
}
const NodeZ: z.ZodType<ElkNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    children: z.array(NodeZ).optional(),
  }),
);
const LabelZ = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
const EdgeZ = z.object({
  id: z.string(),
  // The id of the edge's least-common-ancestor container (`"root"` at the top level). Under
  // `hierarchyHandling: INCLUDE_CHILDREN` ELK returns an edge's section + label coordinates *relative
  // to this container*, so they must be offset by the container's absolute origin to become absolute.
  container: z.string().optional(),
  sections: z.array(SectionZ).optional(),
  labels: z.array(LabelZ).optional(),
});
const ResultZ = z.object({
  width: z.number(),
  height: z.number(),
  children: z.array(NodeZ).optional(),
  edges: z.array(EdgeZ).optional(),
});

// The string-keyed option bag is ELK's API surface, kept at this boundary; the core works with
// the typed LayoutConfig instead. `organic` swaps the layered (Sugiyama) algorithm for ELK's
// force-based `stress` — a deliberately different, free-form style, only ever reached by opt-in.
const elkLayoutOptions = (c: LayoutConfig, organic: boolean): Record<string, string> => {
  if (organic) {
    return {
      "elk.algorithm": "stress",
      "elk.stress.desiredEdgeLength": "140",
      "elk.spacing.nodeNode": String(Math.max(c.nodeSpacing, 60)),
    };
  }
  const base: Record<string, string> = {
    "elk.algorithm": "layered",
    "elk.direction": c.direction,
    "elk.spacing.nodeNode": String(c.nodeSpacing),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(c.layerSpacing),
    // Keep parallel connectors from stacking on top of each other: pull edges apart from one another and
    // from nodes (both within a layer and across the gap between layers), so each gets its own lane on a
    // node's side rather than all sharing the side centre — the main cause of the overlapping-edge look.
    "elk.spacing.edgeEdge": "14",
    "elk.spacing.edgeNode": "14",
    "elk.layered.spacing.edgeEdgeBetweenLayers": "14",
    "elk.layered.spacing.edgeNodeBetweenLayers": "14",
  };
  if (!c.interactive) return base;
  return {
    ...base,
    "elk.layered.crossingMinimization.semiInteractive": "true",
    "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
    "elk.layered.layering.strategy": "INTERACTIVE",
  };
};

// Title space at the top of a subgraph container, plus breathing room around its members.
const CONTAINER_PADDING = "[top=28.0,left=12.0,bottom=12.0,right=12.0]";

// Mirrors the subset of elkjs's mutable `ElkNode` input we build (not `readonly`, to stay
// assignable). Leaves carry a size; containers omit it (ELK sizes them) — matching ELK's own API.
interface ElkInputNode {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkInputNode[];
}

const toElkNode = (c: LayoutNode): ElkInputNode => {
  if (c.kind === "container") {
    // No size — ELK computes it from the children + padding.
    return {
      id: c.id,
      layoutOptions: { "elk.padding": CONTAINER_PADDING },
      children: c.children.map(toElkNode),
    };
  }
  return c.position === null
    ? { id: c.id, width: c.width, height: c.height }
    : { id: c.id, width: c.width, height: c.height, x: c.position.x, y: c.position.y };
};

interface ElkInputEdge {
  id: string;
  sources: string[];
  targets: string[];
  labels?: { id: string; text: string; width: number; height: number }[];
}

const toElkInputEdge = (e: LayoutGraph["edges"][number]): ElkInputEdge => {
  const base: ElkInputEdge = { id: e.id, sources: [...e.sources], targets: [...e.targets] };
  if (e.label === null) return base;
  // A space placeholder text keeps ELK from collapsing the label; only the measured box matters.
  return { ...base, labels: [{ id: `${e.id}-lbl`, text: " ", ...e.label }] };
};

const toElkInput = (g: LayoutGraph, organic: boolean) => ({
  id: g.id,
  // INCLUDE_CHILDREN lays the whole hierarchy out together and routes cross-subgraph edges. ELK then
  // returns each edge's geometry relative to the edge's least-common-ancestor container (tagged on the
  // edge as `container`); `toPositioned` offsets by that container's absolute origin. `edgeLabels.
  // placement: CENTER` makes ELK reserve routing space for each edge's midpoint label and return its
  // position, so a label clears the nodes instead of overlapping them.
  layoutOptions: {
    ...elkLayoutOptions(g.config, organic),
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.edgeLabels.placement": "CENTER",
    "elk.spacing.edgeLabel": "4",
  },
  children: g.children.map(toElkNode),
  edges: g.edges.map(toElkInputEdge),
});

const toPositioned = (r: z.infer<typeof ResultZ>): PositionedGraph => {
  // Child coordinates are relative to their parent; accumulate ancestor offsets into absolutes and
  // tag each node with its container so the renderer can nest them. We also record each container's
  // absolute origin (keyed by id) so edge geometry — which ELK returns relative to the edge's container
  // — can be offset back to absolute below. The top level is `"root"` at the origin.
  const nodes: PositionedNode[] = [];
  const containerOrigin = new Map<string, { readonly x: number; readonly y: number }>([
    ["root", { x: 0, y: 0 }],
  ]);
  const flatten = (
    children: readonly ElkNode[] | undefined,
    parent: NodeId | null,
    ox: number,
    oy: number,
  ): void => {
    for (const c of children ?? []) {
      const x = ox + c.x;
      const y = oy + c.y;
      const id = brand<string, "NodeId">(c.id);
      nodes.push({ id, x, y, width: c.width, height: c.height, parent });
      containerOrigin.set(c.id, { x, y });
      flatten(c.children, id, x, y);
    }
  };
  flatten(r.children, null, 0, 0);
  return {
    width: r.width,
    height: r.height,
    nodes,
    edges: (r.edges ?? []).map((e) => {
      // ELK returns this edge's geometry relative to its `container` (the least-common-ancestor subgraph,
      // or `"root"`); shift by that container's absolute origin to make it absolute. A missing tag means
      // the top level.
      const off = containerOrigin.get(e.container ?? "root") ?? { x: 0, y: 0 };
      // An edge crossing a container boundary is split into multiple `sections`; concatenate them all
      // so the full route survives (taking only `sections[0]` truncated such edges).
      const points = (e.sections ?? []).flatMap((s) => [
        { x: s.startPoint.x + off.x, y: s.startPoint.y + off.y },
        ...(s.bendPoints ?? []).map((p) => ({ x: p.x + off.x, y: p.y + off.y })),
        { x: s.endPoint.x + off.x, y: s.endPoint.y + off.y },
      ]);
      // ELK returns the label's top-left in the same container-relative space; the renderer centres
      // labels, so hand it the absolute label-box centre.
      const lbl = e.labels?.[0];
      const labelPos =
        lbl === undefined
          ? null
          : { x: off.x + lbl.x + lbl.width / 2, y: off.y + lbl.y + lbl.height / 2 };
      return { id: brand<string, "EdgeId">(e.id), points, labelPos };
    }),
  };
};

// "Tidy layout" candidate option-sets (deltas merged over the base config). The first is the default
// (no delta) — its result is the fallback and the non-tidy path. The others ask ELK to minimise edge
// crossings more aggressively / drop strict model-order, giving deterministic alternatives to choose
// from. All are layered drawings, so the family's style is preserved; `lowestEnergy` + `styleOk` pick.
const TIDY_CANDIDATES: readonly Record<string, string>[] = [
  {},
  {
    "elk.layered.considerModelOrder.strategy": "NONE",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  },
  {
    "elk.layered.considerModelOrder.strategy": "NONE",
    "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  },
];

// Run the ELK candidates and pick the lowest-energy scene that still satisfies the style invariants.
// When `tidy` is off, runs only the default candidate (today's exact output). The default candidate is
// always the fallback if no candidate passes the style guard.
const elkSelectBest = async (
  input: ReturnType<typeof toElkInput>,
  buildScene: (positioned: PositionedGraph) => Result<Scene, LayoutError>,
  tidy: boolean,
): Promise<Result<Scene, LayoutError>> => {
  const candidates = tidy ? TIDY_CANDIDATES : [{}];
  let fallback: Result<Scene, LayoutError> | null = null;
  const passing: Scene[] = [];
  for (const extra of candidates) {
    const layoutOptions =
      Object.keys(extra).length === 0 ? input.layoutOptions : { ...input.layoutOptions, ...extra };
    const raw = await elk.layout({ ...input, layoutOptions });
    const decoded = decode(ResultZ, raw);
    if (!decoded.ok) {
      fallback ??= err({
        kind: "layout",
        message: `unexpected ELK result: ${decoded.error.issues.join("; ")}`,
      });
      continue;
    }
    const scene = map(buildScene(toPositioned(decoded.value)), (value) =>
      tidy ? separateOverlaps(minimizeCrossings(mazeRerouteEdges(value))) : value,
    );
    fallback ??= scene; // the default candidate (index 0) is the fallback
    if (scene.ok && styleOk(scene.value)) passing.push(scene.value);
  }
  const best = lowestEnergy(passing);
  if (best === null) return fallback ?? err({ kind: "layout", message: "no layout produced" });
  return ok(best);
};

export const layout = async (
  ast: FlowchartAst,
  seed: ReadonlyMap<NodeId, Point>,
  measure: MeasureText,
  layoutStyle: string = "tidy",
): Promise<Result<Scene, LayoutError>> => {
  const tidy = layoutStyle === "tidy" || layoutStyle === "bus" || layoutStyle === "trunk";
  const organic = layoutStyle === "organic";
  try {
    const input = toElkInput(toElkGraph(ast, seed, measure), organic);
    // Organic (stress) is a single force-based layout — the layered tidy candidates don't apply.
    return await elkSelectBest(input, (positioned) => toScene(positioned, ast), tidy && !organic);
  } catch (e) {
    return err({ kind: "layout", message: messageOf(e) });
  }
};

// A real state is a rounded box; `[*]` start/end pseudo-states are small circles; `<<fork>>`/`<<join>>`
// are bars (rects) and `<<choice>>` a diamond.
const stateShape = (kind: StateKind): NodeShape => {
  switch (kind) {
    case "state":
      return "round";
    case "choice":
      return "diamond";
    case "fork":
    case "join":
      return "rect";
    case "start":
    case "end":
      return "circle";
    default:
      return assertNever(kind);
  }
};

// A state diagram is a directed graph of boxes + labelled edges — structurally a flowchart — so it
// lays out through the same ELK path. Transitions become arrowed edges; ids are re-branded into the
// flowchart id space (a shell-boundary operation).
const stateToFlow = (ast: StateAst): FlowchartAst => ({
  kind: "flowchart",
  direction: "TB",
  nodes: [
    ...ast.states.map((s) => ({
      id: brand<string, "NodeId">(s.id),
      label: s.label,
      shape: stateShape(s.kind),
      icon: null,
    })),
    // Each note is a plain rect; an arrowless connector to its target makes ELK place it adjacent.
    ...ast.notes.map((n) => ({
      id: brand<string, "NodeId">(n.id),
      label: n.text,
      shape: "rect" as const,
      icon: null,
    })),
  ],
  edges: [
    ...ast.transitions.map((t) => ({
      id: brand<string, "EdgeId">(t.id),
      from: brand<string, "NodeId">(t.from),
      to: brand<string, "NodeId">(t.to),
      kind: "arrow" as const,
      label: t.label,
    })),
    ...ast.notes.map((n) => ({
      id: brand<string, "EdgeId">(`note-edge:${n.id}`),
      from: brand<string, "NodeId">(n.target),
      to: brand<string, "NodeId">(n.id),
      kind: "open" as const,
      label: null,
    })),
  ],
  // Composite states map onto flowchart subgraphs — ELK nests them as containers, same machinery.
  subgraphs: ast.composites.map((c) => ({
    id: brand<string, "NodeId">(c.id),
    label: c.label,
    parent: c.parent === null ? null : brand<string, "NodeId">(c.parent),
    nodes: c.states.map((s) => brand<string, "NodeId">(s)),
  })),
});

const stateRole = (kind: StateKind): SceneNodeRole => {
  switch (kind) {
    case "state":
    case "choice":
      return "normal";
    case "start":
      return "stateStart";
    case "end":
      return "stateEnd";
    case "fork":
      return "stateFork";
    case "join":
      return "stateJoin";
    default:
      return assertNever(kind);
  }
};

const boxCenterPoint = (bounds: Rect): Point =>
  point(bounds.origin.x + bounds.size.width / 2, bounds.origin.y + bounds.size.height / 2);

const edgePoint = (from: Rect, to: Rect): Point => {
  const c = boxCenterPoint(from);
  const t = boxCenterPoint(to);
  const dx = t.x - c.x;
  const dy = t.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Number.POSITIVE_INFINITY : from.size.width / 2 / Math.abs(dx);
  const sy = dy === 0 ? Number.POSITIVE_INFINITY : from.size.height / 2 / Math.abs(dy);
  const scale = Math.min(sx, sy);
  return point(c.x + dx * scale, c.y + dy * scale);
};

const noteBounds = (note: SceneNode, target: SceneNode, stateNote: StateNote): Rect => {
  const gap = 32;
  const noteWidth = note.bounds.size.width;
  const noteHeight = note.bounds.size.height;
  const targetLeft = target.bounds.origin.x;
  const targetTop = target.bounds.origin.y;
  const targetWidth = target.bounds.size.width;
  switch (stateNote.side) {
    case "right":
      return rect(targetLeft + targetWidth + gap, targetTop, noteWidth, noteHeight);
    case "left":
      return rect(targetLeft - noteWidth - gap, targetTop, noteWidth, noteHeight);
    case "over":
      return rect(
        targetLeft + targetWidth / 2 - noteWidth / 2,
        targetTop - noteHeight - gap,
        noteWidth,
        noteHeight,
      );
    default:
      return assertNever(stateNote.side);
  }
};

const sceneExtent = (
  nodes: readonly SceneNode[],
  edges: readonly SceneEdge[],
  base: Rect,
): Rect => {
  let minX: number = base.origin.x;
  let minY: number = base.origin.y;
  let maxX: number = base.origin.x + base.size.width;
  let maxY: number = base.origin.y + base.size.height;
  for (const node of nodes) {
    minX = Math.min(minX, node.bounds.origin.x);
    minY = Math.min(minY, node.bounds.origin.y);
    maxX = Math.max(maxX, node.bounds.origin.x + node.bounds.size.width);
    maxY = Math.max(maxY, node.bounds.origin.y + node.bounds.size.height);
  }
  for (const edge of edges) {
    for (const p of edge.waypoints) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return rect(minX, minY, maxX - minX, maxY - minY);
};

const applyStateSemantics = (scene: Scene, ast: StateAst): Scene => {
  const roles = new Map<string, SceneNodeRole>([
    ...ast.states.map((s): readonly [string, SceneNodeRole] => [s.id, stateRole(s.kind)]),
    ...ast.notes.map((n): readonly [string, SceneNodeRole] => [n.id, "stateNote"]),
  ]);
  const noteById = new Map<string, StateNote>(ast.notes.map((n) => [n.id, n]));
  const targetByNote = new Map<string, string>(ast.notes.map((n) => [n.id, n.target]));
  const originalById = new Map<string, SceneNode>(scene.nodes.map((node) => [node.id, node]));
  for (const note of ast.notes) {
    if (!originalById.has(note.id)) throw new Error(`state note missing from scene: ${note.id}`);
    if (!originalById.has(note.target))
      throw new Error(`state note target missing from scene: ${note.target}`);
  }
  const nodes = scene.nodes.map((node): SceneNode => {
    const role = roles.get(node.id) ?? "normal";
    const stateNote = noteById.get(node.id);
    if (stateNote === undefined) return { ...node, role };
    const target = originalById.get(stateNote.target);
    if (target === undefined)
      throw new Error(`state note target missing from scene: ${stateNote.target}`);
    return { ...node, role, bounds: noteBounds(node, target, stateNote) };
  });
  const byId = new Map<string, SceneNode>(nodes.map((node) => [node.id, node]));
  const edges = scene.edges.map((edge): SceneEdge => {
    const noteId = edge.id.startsWith("note-edge:") ? edge.id.slice("note-edge:".length) : null;
    if (noteId === null) return edge;
    const targetId = targetByNote.get(noteId);
    if (targetId === undefined) throw new Error(`state note edge has no note: ${noteId}`);
    const target = byId.get(targetId);
    const note = byId.get(noteId);
    if (target === undefined)
      throw new Error(`state note edge target missing from scene: ${targetId}`);
    if (note === undefined) throw new Error(`state note edge note missing from scene: ${noteId}`);
    return {
      ...edge,
      waypoints: twoOrMore(
        edgePoint(target.bounds, note.bounds),
        edgePoint(note.bounds, target.bounds),
      ),
    };
  });
  return { ...scene, nodes, edges, extent: sceneExtent(nodes, edges, scene.extent) };
};

// One attribute per row, e.g. `string name PK "the customer's name"`.
const attributeRow = (a: ErAst["entities"][number]["attributes"][number]): string => {
  const keys = a.keys.length > 0 ? ` ${a.keys.join(",")}` : "";
  const comment = a.comment === "" ? "" : ` "${a.comment}"`;
  return `${a.type} ${a.name}${keys}${comment}`;
};

// ER, class, and requirement diagrams are all *compartment-box* families: entities sized to fit their
// rows (a flowchart node can't) and laid out through ELK directly. They share this engine — a family
// maps its AST to `CompartmentBox`/`CompartmentEdge` specs and the metrics for its look. `EdgeEnd`
// subsumes ER crow's-foot cardinalities and UML class arrowheads, so each family's ends assign here.
interface CompartmentMetrics {
  readonly direction: "RIGHT" | "DOWN";
  readonly titleH: number;
  readonly rowH: number;
  readonly pad: number;
  readonly minW: number;
  readonly subtitleH: number; // extra title-band height when a box carries a subtitle
}
interface CompartmentBox {
  readonly id: string;
  readonly label: string;
  readonly rows: readonly string[];
  readonly rowDivider: number | null;
  readonly subtitle: string | null;
}
interface CompartmentEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string | null;
  readonly stroke: EdgeStroke;
  readonly fromEnd: EdgeEnd;
  readonly toEnd: EdgeEnd;
  readonly curved: boolean;
  readonly fromLabel: string | null;
  readonly toLabel: string | null;
}

const layoutCompartments = async (
  family: string,
  metrics: CompartmentMetrics,
  boxes: readonly CompartmentBox[],
  edges: readonly CompartmentEdge[],
  measure: MeasureText,
  tidy: boolean,
): Promise<Result<Scene, LayoutError>> => {
  const graph: LayoutGraph = {
    id: "root",
    config: { direction: metrics.direction, interactive: false, nodeSpacing: 50, layerSpacing: 60 },
    children: boxes.map((b) => {
      const seed = Math.max(measure(b.label), b.subtitle === null ? 0 : measure(b.subtitle));
      const widest = b.rows.reduce((w, r) => Math.max(w, measure(r)), seed);
      return {
        kind: "leaf",
        id: brand<string, "NodeId">(b.id),
        width: Math.max(metrics.minW, widest + metrics.pad),
        height:
          metrics.titleH +
          (b.subtitle === null ? 0 : metrics.subtitleH) +
          b.rows.length * metrics.rowH,
        position: null,
      };
    }),
    edges: edges.map((e) => ({
      id: brand<string, "EdgeId">(e.id),
      sources: [brand<string, "NodeId">(e.from)],
      targets: [brand<string, "NodeId">(e.to)],
      label: e.label === null ? null : { width: measure(e.label) + 10, height: 18 },
    })),
  };
  try {
    return await elkSelectBest(
      toElkInput(graph, false), // the compartment families (er/class/requirement) stay layered
      (positioned): Result<Scene, LayoutError> => {
        const posById = new Map(positioned.nodes.map((n) => [n.id as string, n]));
        const edgeById = new Map(edges.map((e) => [e.id, e]));
        const nodes: SceneNode[] = [];
        for (const b of boxes) {
          const p = posById.get(b.id);
          if (p === undefined) {
            return err({ kind: "layout", message: `${family}: entity ${b.id} was not positioned` });
          }
          nodes.push({
            id: brand<string, "SceneNodeId">(b.id),
            bounds: rect(p.x, p.y, p.width, p.height),
            label: b.label,
            shape: "rect",
            parent: null,
            icon: null,
            rows: b.rows.length > 0 ? b.rows : null,
            rowDivider: b.rowDivider,
            subtitle: b.subtitle,
            accent: "none",
            role: "normal",
          });
        }
        const centerById = new Map<string, Point>(
          nodes.map((n) => [
            n.id,
            boxCenter(
              n.bounds.origin.x,
              n.bounds.origin.y,
              n.bounds.size.width,
              n.bounds.size.height,
            ),
          ]),
        );
        const sceneEdges: SceneEdge[] = [];
        for (const pe of positioned.edges) {
          const e = edgeById.get(pe.id);
          if (e === undefined) continue;
          const fromCenter = centerById.get(e.from);
          const toCenter = centerById.get(e.to);
          if (fromCenter === undefined || toCenter === undefined) continue;
          sceneEdges.push({
            id: brand<string, "SceneEdgeId">(pe.id),
            from: brand<string, "SceneNodeId">(e.from),
            to: brand<string, "SceneNodeId">(e.to),
            waypoints: routeWaypoints(pe.points, fromCenter, toCenter),
            label: e.label,
            stroke: e.stroke,
            fromEnd: e.fromEnd,
            toEnd: e.toEnd,
            curved: e.curved,
            fromLabel: e.fromLabel,
            toLabel: e.toLabel,
            labelPos: pe.labelPos === null ? null : point(pe.labelPos.x, pe.labelPos.y),
          });
        }
        return ok({
          nodes,
          edges: sceneEdges,
          wedges: [],
          decorations: [],
          extent: rect(0, 0, positioned.width, positioned.height),
        });
      },
      tidy,
    );
  } catch (e) {
    return err({ kind: "layout", message: messageOf(e) });
  }
};

// ER: attribute rows; the `ErCardinality` strings on each end *are* `EdgeEnd` values; solid line =
// identifying, dashed = non-identifying. Laid out left-to-right.
const layoutEr = (
  ast: ErAst,
  measure: MeasureText,
  tidy: boolean,
): Promise<Result<Scene, LayoutError>> =>
  layoutCompartments(
    "er",
    { direction: "RIGHT", titleH: 30, rowH: 20, pad: 22, minW: 96, subtitleH: 0 },
    ast.entities.map((e) => ({
      id: e.id,
      label: e.label,
      rows: e.attributes.map(attributeRow),
      rowDivider: null,
      subtitle: null,
    })),
    ast.relationships.map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      label: r.label === "" ? null : r.label,
      stroke: r.identifying ? "solid" : "dashed",
      fromEnd: r.fromCard,
      toEnd: r.toCard,
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos: null,
    })),
    measure,
    tidy,
  );

const VIS_GLYPH = (v: ClassMember["visibility"]): string => {
  switch (v) {
    case "public":
      return "+";
    case "private":
      return "-";
    case "protected":
      return "#";
    case "package":
      return "~";
    case null:
      return "";
  }
};
const memberRow = (m: ClassMember): string => `${VIS_GLYPH(m.visibility)}${m.text}`;
const classSubtitle = (e: ClassAst["entities"][number]): string | null =>
  e.stereotype === null ? null : `«${e.stereotype}»`;

// UML class: two compartments — fields then methods, split by an inner divider (`rowDivider`); a
// `«stereotype»` subtitle above the name; `ClassArrow` ends; dashed line for the `..` operators.
const classBox = (e: ClassAst["entities"][number]): CompartmentBox => {
  const fields = e.members.filter((m) => m.kind === "field").map(memberRow);
  const methods = e.members.filter((m) => m.kind === "method").map(memberRow);
  return {
    id: e.id,
    label: e.label,
    rows: [...fields, ...methods],
    rowDivider: fields.length > 0 && methods.length > 0 ? fields.length : null,
    subtitle: classSubtitle(e),
  };
};
const layoutClass = (
  ast: ClassAst,
  measure: MeasureText,
  tidy: boolean,
): Promise<Result<Scene, LayoutError>> =>
  layoutCompartments(
    "class",
    { direction: "DOWN", titleH: 30, rowH: 20, pad: 24, minW: 100, subtitleH: 16 },
    ast.entities.map(classBox),
    ast.relationships.map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      label: r.label === "" ? null : r.label,
      stroke: r.dashed ? "dashed" : "solid",
      fromEnd: r.fromArrow,
      toEnd: r.toArrow,
      curved: false,
      fromLabel: r.fromMult === "" ? null : r.fromMult,
      toLabel: r.toMult === "" ? null : r.toMult,
      labelPos: null,
    })),
    measure,
    tidy,
  );

// A requirement/element node's rows: a `«kind»` tag (its own compartment when fields follow), then a
// `key: value` row per body field.
const reqRows = (e: RequirementAst["entities"][number]): readonly string[] => [
  `«${e.kind}»`,
  ...e.fields.map((f) => `${f.key}: ${f.value}`),
];

// Requirement diagram: requirements + elements joined by the seven SysML verbs — an open arrow
// labelled with its verb, solid for `contains` and dashed for the rest.
const layoutRequirement = (
  ast: RequirementAst,
  measure: MeasureText,
  tidy: boolean,
): Promise<Result<Scene, LayoutError>> =>
  layoutCompartments(
    "requirement",
    { direction: "DOWN", titleH: 30, rowH: 20, pad: 24, minW: 100, subtitleH: 16 },
    ast.entities.map((e) => {
      const rows = reqRows(e);
      return {
        id: e.id,
        label: e.name,
        rows,
        rowDivider: rows.length > 1 ? 1 : null,
        subtitle: null,
      };
    }),
    ast.relationships.map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      label: r.kind,
      stroke: r.kind === "contains" ? "solid" : "dashed",
      fromEnd: "none",
      toEnd: "arrowOpen",
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos: null,
    })),
    measure,
    tidy,
  );

// Routes by family: flowchart through ELK (async); the rest through pure layouts. `measure` sizes
// labels — callers pass a real canvas `measureText`, or `heuristicMeasure` for the char-width metric.
const layoutByFamily = async (
  ast: DiagramAst,
  measure: MeasureText,
  collapsed: ReadonlySet<NodeId>,
  layoutStyle: string,
): Promise<Result<Scene, LayoutError>> => {
  const tidy = layoutStyle === "tidy" || layoutStyle === "bus" || layoutStyle === "trunk";
  const classic = layoutStyle === "classic";
  switch (ast.kind) {
    case "flowchart":
      return layout(ast, new Map(), measure, layoutStyle);
    case "sequence":
      return layoutSequence(ast, measure);
    case "c4":
      return layoutC4(ast, measure);
    case "block":
      return layoutBlock(ast, measure);
    case "network":
      return layoutNetwork(ast, measure);
    case "cloud":
      return layoutCloud(ast, measure, collapsed);
    case "state":
      return map(await layout(stateToFlow(ast), new Map(), measure, layoutStyle), (scene) =>
        applyStateSemantics(scene, ast),
      );
    case "er":
      return layoutEr(ast, measure, tidy);
    case "class":
      return layoutClass(ast, measure, tidy);
    case "requirement":
      return layoutRequirement(ast, measure, tidy);
    case "gitGraph":
      return layoutGitGraph(ast, measure, tidy, classic);
    case "timeline":
      return layoutTimeline(ast, measure);
    case "mindmap":
      return layoutMindmap(ast, measure);
    case "pie":
      return layoutPie(ast, measure, layoutStyle === "donut");
    case "gantt":
      return layoutGantt(ast, measure);
  }
};

const usesSideCenterMounts = (kind: DiagramAst["kind"]): boolean => {
  switch (kind) {
    case "flowchart":
    case "er":
    case "class":
    case "requirement":
      return true;
    case "c4":
    case "block":
    case "network":
    case "cloud":
    case "sequence":
    case "state":
    case "gitGraph":
    case "timeline":
    case "mindmap":
    case "pie":
    case "gantt":
      return false;
    default:
      return assertNever(kind);
  }
};

export const layoutDiagram = async (
  ast: DiagramAst,
  measure: MeasureText,
  // Ids of cloud groups the editor has collapsed (hidden contents); empty for every other family.
  collapsed: ReadonlySet<NodeId> = new Set(),
  // The layout style name: "tidy" (default), "classic", "organic", "relaxed", "bus", "trunk" etc.
  layoutStyle = "tidy",
): Promise<Result<Scene, LayoutError>> => {
  const routed = await layoutByFamily(ast, measure, collapsed, layoutStyle);
  return map(routed, (scene) => {
    let finalScene = scene;
    const isSpread =
      ast.kind === "block" || ast.kind === "network" || ast.kind === "cloud" || ast.kind === "c4";
    if (isSpread) {
      if (layoutStyle === "trunk") {
        finalScene = trunkRoutes(finalScene);
      } else if (layoutStyle === "bus") {
        finalScene = respreadPorts(finalScene, true);
      }
    }
    const labelled = decollideEdgeLabels(finalScene, measure);
    return usesSideCenterMounts(ast.kind) ? snapSceneEdgesToMountPoints(labelled) : labelled;
  });
};
