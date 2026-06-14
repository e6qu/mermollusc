import { decode, err, type Result } from "@m/std";
import type { FlowchartAst, Scene } from "@m/contracts";
import ELK from "elkjs/lib/elk.bundled.js";
import { z } from "zod";
import { toElkGraph, toScene } from "../core/index.js";
import type { LayoutError, LayoutGraph, PositionedGraph } from "../core/index.js";

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

// elkjs wants mutable arrays; the core produces readonly. Spread at the boundary.
const toElkInput = (g: LayoutGraph) => ({
  id: g.id,
  layoutOptions: { ...g.layoutOptions },
  children: g.children.map((c) => ({ id: c.id, width: c.width, height: c.height })),
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

export const layout = async (ast: FlowchartAst): Promise<Result<Scene, LayoutError>> => {
  try {
    const raw = await elk.layout(toElkInput(toElkGraph(ast)));
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
