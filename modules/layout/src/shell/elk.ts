import { brand, decode, err, ok, point, rect, type Point, type Result } from "@m/std";
import type {
  ClassAst,
  ClassMember,
  DiagramAst,
  ErAst,
  FlowchartAst,
  NodeId,
  RequirementAst,
  Scene,
  SceneEdge,
  SceneNode,
  StateAst,
} from "@m/contracts";
import ELK from "elkjs/lib/elk.bundled.js";
import { z } from "zod";
import {
  layoutBlock,
  layoutC4,
  layoutCloud,
  layoutNetwork,
  layoutSequence,
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
      const section = e.sections?.[0];
      const points =
        section === undefined
          ? []
          : [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
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

// A state diagram is a directed graph of boxes + labelled edges — structurally a flowchart — so it
// lays out through the same ELK path. States become round nodes; the `[*]` start/end pseudo-states
// become small circles; transitions become arrowed edges. Ids are re-branded into the flowchart id
// space (a shell-boundary operation).
const stateToFlow = (ast: StateAst): FlowchartAst => ({
  kind: "flowchart",
  direction: "TB",
  nodes: ast.states.map((s) => ({
    id: brand<string, "NodeId">(s.id),
    label: s.label,
    shape: s.kind === "state" ? "round" : "circle",
  })),
  edges: ast.transitions.map((t) => ({
    id: brand<string, "EdgeId">(t.id),
    from: brand<string, "NodeId">(t.from),
    to: brand<string, "NodeId">(t.to),
    kind: "arrow",
    label: t.label,
  })),
  // Composite states map onto flowchart subgraphs — ELK nests them as containers, same machinery.
  subgraphs: ast.composites.map((c) => ({
    id: brand<string, "NodeId">(c.id),
    label: c.label,
    parent: c.parent === null ? null : brand<string, "NodeId">(c.parent),
    nodes: c.states.map((s) => brand<string, "NodeId">(s)),
  })),
});

// One attribute per row, e.g. `string name PK "the customer's name"`.
const attributeRow = (a: ErAst["entities"][number]["attributes"][number]): string => {
  const keys = a.keys.length > 0 ? ` ${a.keys.join(",")}` : "";
  const comment = a.comment === "" ? "" : ` "${a.comment}"`;
  return `${a.type} ${a.name}${keys}${comment}`;
};

// ER lays out through ELK like a flowchart, but entities are sized to fit their attribute rows (a
// flowchart node can't), so it builds the ELK graph directly rather than via `toElkGraph`. The Scene
// carries crow's-foot cardinality on each relationship end (the `ErCardinality` strings *are*
// `EdgeEnd` values) and the attribute rows on each entity.
const ER_TITLE_H = 30;
const ER_ROW_H = 20;
const ER_PAD = 22;
const ER_MIN_W = 96;
const layoutEr = async (ast: ErAst, measure: MeasureText): Promise<Result<Scene, LayoutError>> => {
  const rowsById = new Map(
    ast.entities.map((e) => [e.id as string, e.attributes.map(attributeRow)]),
  );
  const graph: LayoutGraph = {
    id: "root",
    config: { direction: "RIGHT", interactive: false, nodeSpacing: 50, layerSpacing: 60 },
    children: ast.entities.map((e) => {
      const rows = rowsById.get(e.id) ?? [];
      const widest = rows.reduce((w, r) => Math.max(w, measure(r)), measure(e.label));
      return {
        kind: "leaf",
        id: brand<string, "NodeId">(e.id),
        width: Math.max(ER_MIN_W, widest + ER_PAD),
        height: ER_TITLE_H + rows.length * ER_ROW_H,
        position: null,
      };
    }),
    edges: ast.relationships.map((r) => ({
      id: brand<string, "EdgeId">(r.id),
      sources: [brand<string, "NodeId">(r.from)],
      targets: [brand<string, "NodeId">(r.to)],
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
    const relById = new Map(ast.relationships.map((r) => [r.id as string, r]));
    const nodes: SceneNode[] = [];
    for (const e of ast.entities) {
      const p = posById.get(e.id);
      if (p === undefined) {
        return err({ kind: "layout", message: `er: entity ${e.id} was not positioned` });
      }
      const rows = rowsById.get(e.id) ?? [];
      nodes.push({
        id: brand<string, "SceneNodeId">(e.id),
        bounds: rect(p.x, p.y, p.width, p.height),
        label: e.label,
        shape: "rect",
        parent: null,
        icon: null,
        rows: rows.length > 0 ? rows : null,
        rowDivider: null,
      });
    }
    const edges: SceneEdge[] = [];
    for (const pe of positioned.edges) {
      const rel = relById.get(pe.id);
      if (rel === undefined) continue;
      edges.push({
        id: brand<string, "SceneEdgeId">(pe.id),
        from: brand<string, "SceneNodeId">(rel.from),
        to: brand<string, "SceneNodeId">(rel.to),
        waypoints: pe.points.map((q) => point(q.x, q.y)),
        label: rel.label === "" ? null : rel.label,
        stroke: rel.identifying ? "solid" : "dashed",
        fromEnd: rel.fromCard,
        toEnd: rel.toCard,
      });
    }
    return ok({ nodes, edges, extent: rect(0, 0, positioned.width, positioned.height) });
  } catch (e) {
    return err({ kind: "layout", message: e instanceof Error ? e.message : String(e) });
  }
};

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

// UML class diagram: like ER (compartment boxes sized to content, laid out through ELK directly), but
// each box has two compartments — fields then methods, separated by an inner divider (`rowDivider`) —
// and relationship ends carry UML arrowheads (`ClassArrow` *is* an `EdgeEnd`). Dashed line = the
// `..` operators (dependency/realization).
// Title/row heights match the renderer's compartment metrics (shared with ER) so dividers + rows land
// on the boundaries the box was sized for.
const CLASS_TITLE_H = 30;
const CLASS_ROW_H = 20;
const CLASS_PAD = 24;
const CLASS_MIN_W = 100;
const layoutClass = async (
  ast: ClassAst,
  measure: MeasureText,
): Promise<Result<Scene, LayoutError>> => {
  // Fields first, then methods — Mermaid's two compartments. The divider sits between them (null when
  // either compartment is empty, so a single-compartment box draws only its title divider).
  const compartmentsById = new Map<string, { rows: string[]; divider: number | null }>();
  for (const e of ast.entities) {
    const fields = e.members.filter((m) => m.kind === "field").map(memberRow);
    const methods = e.members.filter((m) => m.kind === "method").map(memberRow);
    const rows = [...fields, ...methods];
    const divider = fields.length > 0 && methods.length > 0 ? fields.length : null;
    compartmentsById.set(e.id, { rows, divider });
  }
  const graph: LayoutGraph = {
    id: "root",
    config: { direction: "DOWN", interactive: false, nodeSpacing: 50, layerSpacing: 60 },
    children: ast.entities.map((e) => {
      const rows = compartmentsById.get(e.id)?.rows ?? [];
      const widest = rows.reduce((w, r) => Math.max(w, measure(r)), measure(e.label));
      return {
        kind: "leaf",
        id: brand<string, "NodeId">(e.id),
        width: Math.max(CLASS_MIN_W, widest + CLASS_PAD),
        height: CLASS_TITLE_H + rows.length * CLASS_ROW_H,
        position: null,
      };
    }),
    edges: ast.relationships.map((r) => ({
      id: brand<string, "EdgeId">(r.id),
      sources: [brand<string, "NodeId">(r.from)],
      targets: [brand<string, "NodeId">(r.to)],
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
    const relById = new Map(ast.relationships.map((r) => [r.id as string, r]));
    const nodes: SceneNode[] = [];
    for (const e of ast.entities) {
      const p = posById.get(e.id);
      if (p === undefined) {
        return err({ kind: "layout", message: `class: entity ${e.id} was not positioned` });
      }
      const comp = compartmentsById.get(e.id) ?? { rows: [], divider: null };
      nodes.push({
        id: brand<string, "SceneNodeId">(e.id),
        bounds: rect(p.x, p.y, p.width, p.height),
        label: e.label,
        shape: "rect",
        parent: null,
        icon: null,
        rows: comp.rows.length > 0 ? comp.rows : null,
        rowDivider: comp.divider,
      });
    }
    const edges: SceneEdge[] = [];
    for (const pe of positioned.edges) {
      const rel = relById.get(pe.id);
      if (rel === undefined) continue;
      edges.push({
        id: brand<string, "SceneEdgeId">(pe.id),
        from: brand<string, "SceneNodeId">(rel.from),
        to: brand<string, "SceneNodeId">(rel.to),
        waypoints: pe.points.map((q) => point(q.x, q.y)),
        label: rel.label === "" ? null : rel.label,
        stroke: rel.dashed ? "dashed" : "solid",
        fromEnd: rel.fromArrow,
        toEnd: rel.toArrow,
      });
    }
    return ok({ nodes, edges, extent: rect(0, 0, positioned.width, positioned.height) });
  } catch (e) {
    return err({ kind: "layout", message: e instanceof Error ? e.message : String(e) });
  }
};

// A requirement/element node's rows: a `«kind»` tag, then one `key: value` row per body field. The
// tag sits in its own compartment (an inner divider before the fields) when there are any.
const reqRows = (e: RequirementAst["entities"][number]): readonly string[] => [
  `«${e.kind}»`,
  ...e.fields.map((f) => `${f.key}: ${f.value}`),
];

// Requirement diagram: compartment boxes (like ER/class) for requirements + elements, joined by the
// seven SysML verbs. Each relationship renders as an open arrow labelled with its verb — solid for
// `contains`, dashed for the rest (derive/satisfy/verify/refine/trace/copy).
const layoutRequirement = async (
  ast: RequirementAst,
  measure: MeasureText,
): Promise<Result<Scene, LayoutError>> => {
  const rowsById = new Map(ast.entities.map((e) => [e.id as string, reqRows(e)]));
  const graph: LayoutGraph = {
    id: "root",
    config: { direction: "DOWN", interactive: false, nodeSpacing: 50, layerSpacing: 60 },
    children: ast.entities.map((e) => {
      const rows = rowsById.get(e.id) ?? [];
      const widest = rows.reduce((w, r) => Math.max(w, measure(r)), measure(e.name));
      return {
        kind: "leaf",
        id: brand<string, "NodeId">(e.id),
        width: Math.max(CLASS_MIN_W, widest + CLASS_PAD),
        height: CLASS_TITLE_H + rows.length * CLASS_ROW_H,
        position: null,
      };
    }),
    edges: ast.relationships.map((r) => ({
      id: brand<string, "EdgeId">(r.id),
      sources: [brand<string, "NodeId">(r.from)],
      targets: [brand<string, "NodeId">(r.to)],
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
    const relById = new Map(ast.relationships.map((r) => [r.id as string, r]));
    const nodes: SceneNode[] = [];
    for (const e of ast.entities) {
      const p = posById.get(e.id);
      if (p === undefined) {
        return err({ kind: "layout", message: `requirement: entity ${e.id} was not positioned` });
      }
      const rows = rowsById.get(e.id) ?? [];
      nodes.push({
        id: brand<string, "SceneNodeId">(e.id),
        bounds: rect(p.x, p.y, p.width, p.height),
        label: e.name,
        shape: "rect",
        parent: null,
        icon: null,
        rows,
        rowDivider: rows.length > 1 ? 1 : null,
      });
    }
    const edges: SceneEdge[] = [];
    for (const pe of positioned.edges) {
      const rel = relById.get(pe.id);
      if (rel === undefined) continue;
      edges.push({
        id: brand<string, "SceneEdgeId">(pe.id),
        from: brand<string, "SceneNodeId">(rel.from),
        to: brand<string, "SceneNodeId">(rel.to),
        waypoints: pe.points.map((q) => point(q.x, q.y)),
        label: rel.kind,
        stroke: rel.kind === "contains" ? "solid" : "dashed",
        fromEnd: "none",
        toEnd: "arrowOpen",
      });
    }
    return ok({ nodes, edges, extent: rect(0, 0, positioned.width, positioned.height) });
  } catch (e) {
    return err({ kind: "layout", message: e instanceof Error ? e.message : String(e) });
  }
};

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
      return layout(stateToFlow(ast), new Map(), measure);
    case "er":
      return layoutEr(ast, measure);
    case "class":
      return layoutClass(ast, measure);
    case "requirement":
      return layoutRequirement(ast, measure);
  }
};
