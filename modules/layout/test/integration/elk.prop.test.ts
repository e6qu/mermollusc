import fc from "fast-check";
import { brand, isOk } from "@m/std";
import type { EdgeKind, FlowDirection, FlowchartAst, NodeShape } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layout } from "../../src/shell/elk.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

const shape: fc.Arbitrary<NodeShape> = fc.constantFrom(
  "rect",
  "round",
  "stadium",
  "diamond",
  "circle",
);
const kind: fc.Arbitrary<EdgeKind> = fc.constantFrom("arrow", "open", "dotted", "thick");
const direction: fc.Arbitrary<FlowDirection> = fc.constantFrom("TB", "BT", "LR", "RL");

// ids n0.. (unique); edges connect existing nodes. Label content only affects node sizing.
const astArb: fc.Arbitrary<FlowchartAst> = fc.integer({ min: 1, max: 5 }).chain((count) =>
  fc
    .record({
      direction,
      labels: fc.array(fc.string({ minLength: 1, maxLength: 8 }), {
        minLength: count,
        maxLength: count,
      }),
      shapes: fc.array(shape, { minLength: count, maxLength: count }),
      edges: fc.array(fc.record({ from: fc.nat(), to: fc.nat(), kind }), { maxLength: 5 }),
      // A random subset of node indices to nest in one subgraph — exercises the hierarchical (container-
      // relative coordinate) path, where edge geometry is offset back to absolute.
      nested: fc.array(fc.nat(), { maxLength: 4 }),
    })
    .map((r): FlowchartAst => {
      const members = [...new Set(r.nested.map((i) => i % count))].map((i) => nid(`n${i}`));
      return {
        kind: "flowchart",
        direction: r.direction,
        nodes: r.labels.map((label, i) => ({
          id: nid(`n${i}`),
          label,
          shape: r.shapes[i] ?? "rect",
          icon: null,
        })),
        edges: r.edges.map((e, j) => ({
          id: eid(`e${j}`),
          from: nid(`n${e.from % count}`),
          to: nid(`n${e.to % count}`),
          kind: e.kind,
          label: null,
        })),
        subgraphs:
          members.length > 0 ? [{ id: nid("SG"), label: "SG", parent: null, nodes: members }] : [],
      };
    }),
);

describe("ELK flowchart layout — invariants (property-based)", () => {
  it("preserves node identity and fits every box inside the reported extent", async () => {
    await fc.assert(
      fc.asyncProperty(astArb, async (ast) => {
        // Both pipelines carry the same invariants: the classic (default, Mermaid-parity) single run
        // and the opt-in tidy candidate search.
        for (const style of ["classic", "tidy"] as const) {
          const r = await layout(ast, new Map(), heuristicMeasure, style);
          expect(isOk(r)).toBe(true);
          if (!isOk(r)) return;
          const scene = r.value;
          // The scene carries a `container` node per subgraph in addition to the leaf nodes.
          const expected = new Set([
            ...ast.nodes.map((n) => n.id),
            ...ast.subgraphs.map((s) => s.id),
          ]);
          expect(new Set(scene.nodes.map((n) => n.id))).toEqual(expected);
          for (const n of scene.nodes) {
            const { origin, size } = n.bounds;
            expect(origin.x).toBeGreaterThanOrEqual(-1e-6);
            expect(origin.y).toBeGreaterThanOrEqual(-1e-6);
            expect(origin.x + size.width).toBeLessThanOrEqual(scene.extent.size.width + 1e-6);
            expect(origin.y + size.height).toBeLessThanOrEqual(scene.extent.size.height + 1e-6);
          }
        }
      }),
      { numRuns: 25 },
    );
  });

  it("routes every edge so its endpoints land on its source/target node boxes", async () => {
    await fc.assert(
      fc.asyncProperty(astArb, async (ast) => {
        for (const style of ["classic", "tidy"] as const) {
          const r = await layout(ast, new Map(), heuristicMeasure, style);
          expect(isOk(r)).toBe(true);
          if (!isOk(r)) return;
          const scene = r.value;
          const byId = new Map(scene.nodes.map((n) => [n.id, n.bounds]));
          // A waypoint is "on" a box if it's within a small tolerance of its border (edges are border-
          // clipped). This is the invariant the container-offset bug broke for intra-subgraph edges.
          const near = (p: { x: number; y: number }, id: string): boolean => {
            const b = byId.get(brand<string, "SceneNodeId">(id));
            return (
              b !== undefined &&
              p.x >= b.origin.x - 8 &&
              p.x <= b.origin.x + b.size.width + 8 &&
              p.y >= b.origin.y - 8 &&
              p.y <= b.origin.y + b.size.height + 8
            );
          };
          for (const e of scene.edges) {
            const first = e.waypoints[0];
            const last = e.waypoints[e.waypoints.length - 1];
            if (last === undefined) continue;
            expect(near(first, e.from)).toBe(true);
            expect(near(last, e.to)).toBe(true);
          }
        }
      }),
      { numRuns: 30 },
    );
  });
});
