import { decode, err, type Point, type Result } from "@m/std";
import type { FlowchartAst, NodeId, Scene } from "@m/contracts";
import ELK from "elkjs/lib/elk.bundled.js";
import { z } from "zod";
import { toElkGraph, toScene } from "../core/index.js";
import type { LayoutConfig, LayoutError, LayoutGraph, PositionedGraph } from "../core/index.js";

const elk = new ELK();

const PointZ = z.object({ x: z.number(), y: z.number() });
const SectionZ = z.object({
  startPoint: PointZ,
  endPoint: PointZ,
  bendPoints: z.array(PointZ).optional(),
});
const NodeZ = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
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

const toElkInput = (g: LayoutGraph) => ({
  id: g.id,
  layoutOptions: elkLayoutOptions(g.config),
  children: g.children.map((c) =>
    c.position === null
      ? { id: c.id, width: c.width, height: c.height }
      : { id: c.id, width: c.width, height: c.height, x: c.position.x, y: c.position.y },
  ),
  edges: g.edges.map((e) => ({ id: e.id, sources: [...e.sources], targets: [...e.targets] })),
});

const toPositioned = (r: z.infer<typeof ResultZ>): PositionedGraph => ({
  width: r.width,
  height: r.height,
  nodes: (r.children ?? []).map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
  })),
  edges: (r.edges ?? []).map((e) => {
    const section = e.sections?.[0];
    const points =
      section === undefined
        ? []
        : [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    return { id: e.id, points };
  }),
});

export const layout = async (
  ast: FlowchartAst,
  seed: ReadonlyMap<NodeId, Point> = new Map(),
): Promise<Result<Scene, LayoutError>> => {
  try {
    const raw = await elk.layout(toElkInput(toElkGraph(ast, seed)));
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
