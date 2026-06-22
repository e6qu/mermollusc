import { assertNever, brand, decode, err, map, ok, rect, type Point, type Result } from "@m/std";
import { boxCenter, routeWaypoints } from "../core/route.js";
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
  toElkGraph,
  toScene,
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
const EdgeZ = z.object({ id: z.string(), sections: z.array(SectionZ).optional() });
const ResultZ = z.object({
  width: z.number(),
  height: z.number(),
  children: z.array(NodeZ).optional(),
  edges: z.array(EdgeZ).optional(),
});

// The string-keyed option bag is ELK's API surface, kept at this boundary; the core works with
// the typed LayoutConfig instead.
const elkLayoutOptions = (c: LayoutConfig): Record<string, string> => {
  const base: Record<string, string> = {
    "elk.algorithm": "layered",
    "elk.direction": c.direction,
    "elk.spacing.nodeNode": String(c.nodeSpacing),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(c.layerSpacing),
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

const toElkInput = (g: LayoutGraph) => ({
  id: g.id,
  // INCLUDE_CHILDREN lays the whole hierarchy out together and routes cross-subgraph edges; edges
  // stay declared on the root, so their returned coordinates are already in root (absolute) space.
  layoutOptions: { ...elkLayoutOptions(g.config), "elk.hierarchyHandling": "INCLUDE_CHILDREN" },
  children: g.children.map(toElkNode),
  edges: g.edges.map((e) => ({ id: e.id, sources: [...e.sources], targets: [...e.targets] })),
});

const toPositioned = (r: z.infer<typeof ResultZ>): PositionedGraph => {
  // Child coordinates are relative to their parent; accumulate ancestor offsets into absolutes and
  // tag each node with its container so the renderer can nest them.
  const nodes: PositionedNode[] = [];
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
      flatten(c.children, id, x, y);
    }
  };
  flatten(r.children, null, 0, 0);
  return {
    width: r.width,
    height: r.height,
    nodes,
    edges: (r.edges ?? []).map((e) => {
      // An edge crossing a container boundary is split into multiple `sections`; concatenate them all
      // so the full route survives (taking only `sections[0]` truncated such edges).
      const points = (e.sections ?? []).flatMap((s) => [
        s.startPoint,
        ...(s.bendPoints ?? []),
        s.endPoint,
      ]);
      return { id: brand<string, "EdgeId">(e.id), points };
    }),
  };
};

export const layout = async (
  ast: FlowchartAst,
  seed: ReadonlyMap<NodeId, Point>,
  measure: MeasureText,
): Promise<Result<Scene, LayoutError>> => {
  try {
    const raw = await elk.layout(toElkInput(toElkGraph(ast, seed, measure)));
    const decoded = decode(ResultZ, raw);
    if (!decoded.ok) {
      return err({
        kind: "layout",
        message: `unexpected ELK result: ${decoded.error.issues.join("; ")}`,
      });
    }
    return toScene(toPositioned(decoded.value), ast);
  } catch (e) {
    return err({ kind: "layout", message: e instanceof Error ? e.message : String(e) });
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
    })),
    // Each note is a plain rect; an arrowless connector to its target makes ELK place it adjacent.
    ...ast.notes.map((n) => ({
      id: brand<string, "NodeId">(n.id),
      label: n.text,
      shape: "rect" as const,
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

const applyStateRoles = (scene: Scene, ast: StateAst): Scene => {
  const roles = new Map<string, SceneNodeRole>([
    ...ast.states.map((s): readonly [string, SceneNodeRole] => [s.id, stateRole(s.kind)]),
    ...ast.notes.map((n): readonly [string, SceneNodeRole] => [n.id, "stateNote"]),
  ]);
  return {
    ...scene,
    nodes: scene.nodes.map(
      (node): SceneNode => ({
        ...node,
        role: roles.get(node.id) ?? "normal",
      }),
    ),
  };
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
    })),
  };
  try {
    const raw = await elk.layout(toElkInput(graph));
    const decoded = decode(ResultZ, raw);
    if (!decoded.ok) {
      return err({
        kind: "layout",
        message: `unexpected ELK result: ${decoded.error.issues.join("; ")}`,
      });
    }
    const positioned = toPositioned(decoded.value);
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
        boxCenter(n.bounds.origin.x, n.bounds.origin.y, n.bounds.size.width, n.bounds.size.height),
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
      });
    }
    return ok({
      nodes,
      edges: sceneEdges,
      wedges: [],
      decorations: [],
      extent: rect(0, 0, positioned.width, positioned.height),
    });
  } catch (e) {
    return err({ kind: "layout", message: e instanceof Error ? e.message : String(e) });
  }
};

// ER: attribute rows; the `ErCardinality` strings on each end *are* `EdgeEnd` values; solid line =
// identifying, dashed = non-identifying. Laid out left-to-right.
const layoutEr = (ast: ErAst, measure: MeasureText): Promise<Result<Scene, LayoutError>> =>
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
    })),
    measure,
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
const layoutClass = (ast: ClassAst, measure: MeasureText): Promise<Result<Scene, LayoutError>> =>
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
    })),
    measure,
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
    })),
    measure,
  );

// Routes by family: flowchart through ELK (async); the rest through pure layouts. `measure` sizes
// labels — callers pass a real canvas `measureText`, or `heuristicMeasure` for the char-width metric.
export const layoutDiagram = async (
  ast: DiagramAst,
  measure: MeasureText,
): Promise<Result<Scene, LayoutError>> => {
  switch (ast.kind) {
    case "flowchart":
      return layout(ast, new Map(), measure);
    case "sequence":
      return layoutSequence(ast, measure);
    case "c4":
      return layoutC4(ast, measure);
    case "block":
      return layoutBlock(ast, measure);
    case "network":
      return layoutNetwork(ast, measure);
    case "cloud":
      return layoutCloud(ast, measure);
    case "state":
      return map(await layout(stateToFlow(ast), new Map(), measure), (scene) =>
        applyStateRoles(scene, ast),
      );
    case "er":
      return layoutEr(ast, measure);
    case "class":
      return layoutClass(ast, measure);
    case "requirement":
      return layoutRequirement(ast, measure);
    case "gitGraph":
      return layoutGitGraph(ast, measure);
    case "timeline":
      return layoutTimeline(ast, measure);
    case "mindmap":
      return layoutMindmap(ast, measure);
    case "pie":
      return layoutPie(ast, measure);
    case "gantt":
      return layoutGantt(ast, measure);
  }
};
