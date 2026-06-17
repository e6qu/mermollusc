import fc from "fast-check";
import { brand, isOk } from "@m/std";
import type { EdgeKind, FlowDirection, FlowchartAst, NodeShape } from "@m/contracts";
import { describe, expect, it } from "vitest";
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
    })
    .map(
      (r): FlowchartAst => ({
        kind: "flowchart",
        direction: r.direction,
        nodes: r.labels.map((label, i) => ({ id: nid(`n${i}`), label, shape: r.shapes[i] ?? "rect" })),
        edges: r.edges.map((e, j) => ({
          id: eid(`e${j}`),
          from: nid(`n${e.from % count}`),
          to: nid(`n${e.to % count}`),
          kind: e.kind,
          label: null,
        })),
        subgraphs: [],
      }),
    ),
);

describe("ELK flowchart layout — invariants (property-based)", () => {
  it("preserves node identity and fits every box inside the reported extent", async () => {
    await fc.assert(
      fc.asyncProperty(astArb, async (ast) => {
        const r = await layout(ast);
        expect(isOk(r)).toBe(true);
        if (!isOk(r)) return;
        const scene = r.value;
        expect(new Set(scene.nodes.map((n) => n.id))).toEqual(new Set(ast.nodes.map((n) => n.id)));
        for (const n of scene.nodes) {
          const { origin, size } = n.bounds;
          expect(origin.x).toBeGreaterThanOrEqual(-1e-6);
          expect(origin.y).toBeGreaterThanOrEqual(-1e-6);
          expect(origin.x + size.width).toBeLessThanOrEqual(scene.extent.size.width + 1e-6);
          expect(origin.y + size.height).toBeLessThanOrEqual(scene.extent.size.height + 1e-6);
        }
      }),
      { numRuns: 25 },
    );
  });
});
