import { decode, err, ok, type Point, type Result } from "@m/std";
import type { DiagramAst, FlowchartAst, NodeId, Scene } from "@m/contracts";
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
    parent: string | null,
    ox: number,
    oy: number,
  ): void => {
    for (const c of children ?? []) {
      const x = ox + c.x;
      const y = oy + c.y;
      nodes.push({ id: c.id, x, y, width: c.width, height: c.height, parent });
      flatten(c.children, c.id, x, y);
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
      return { id: e.id, points };
    }),
  };
};

export const layout = async (
  ast: FlowchartAst,
  seed: ReadonlyMap<NodeId, Point> = new Map(),
  measure?: MeasureText,
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

// Routes by family: flowchart through ELK (async); the rest through pure layouts. `measure` (when
// supplied) sizes labels with real text metrics; otherwise each layout uses the char-width heuristic.
export const layoutDiagram = async (
  ast: DiagramAst,
  measure?: MeasureText,
): Promise<Result<Scene, LayoutError>> => {
  switch (ast.kind) {
    case "flowchart":
      return layout(ast, new Map(), measure);
    case "sequence":
      return ok(layoutSequence(ast, measure));
    case "c4":
      return ok(layoutC4(ast, measure));
    case "block":
      return ok(layoutBlock(ast, measure));
    case "network":
      return ok(layoutNetwork(ast, measure));
    case "cloud":
      return ok(layoutCloud(ast, measure));
  }
};
