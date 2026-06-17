import fc from "fast-check";
import { brand, isOk } from "@m/std";
import type { EdgeKind, FlowDirection, FlowchartAst, NodeShape } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { print } from "../../src/core/print.js";
import { parse } from "../../src/shell/parse.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

// Labels restricted to characters that survive a print→parse round-trip: no bracket/pipe/newline
// (would confuse the shape/label grammar) and trimmed (the parser trims label whitespace).
const safeLabel = fc
  .array(fc.constantFrom(..."abcdefgh0123 "), { minLength: 1, maxLength: 10 })
  .map((cs) => cs.join("").trim())
  .filter((s) => s.length > 0);

// The shapes the flowchart parser reproduces (container is C4-only and doesn't round-trip here).
const shape: fc.Arbitrary<NodeShape> = fc.constantFrom(
  "rect",
  "round",
  "stadium",
  "diamond",
  "circle",
);
const kind: fc.Arbitrary<EdgeKind> = fc.constantFrom("arrow", "open", "dotted", "thick");
const direction: fc.Arbitrary<FlowDirection> = fc.constantFrom("TB", "BT", "LR", "RL");

// ids are n0..n(count-1) (unique, valid, never a keyword); edge ids e0.. in order — exactly what
// the parser assigns, so equality is meaningful.
const astArb: fc.Arbitrary<FlowchartAst> = fc.integer({ min: 1, max: 6 }).chain((count) =>
  fc
    .record({
      direction,
      labels: fc.array(safeLabel, { minLength: count, maxLength: count }),
      shapes: fc.array(shape, { minLength: count, maxLength: count }),
      edges: fc.array(
        fc.record({
          from: fc.nat(),
          to: fc.nat(),
          kind,
          label: fc.option(safeLabel, { nil: null }),
        }),
        { maxLength: 6 },
      ),
    })
    .map(
      (r): FlowchartAst => ({
        kind: "flowchart",
        direction: r.direction,
        nodes: r.labels.map((label, i) => ({ id: nid(`n${i}`), label, shape: r.shapes[i] ?? "rect" })),
        edges: r.edges.map((e, i) => ({
          id: eid(`e${i}`),
          from: nid(`n${e.from % count}`),
          to: nid(`n${e.to % count}`),
          kind: e.kind,
          label: e.label,
        })),
        subgraphs: [],
      }),
    ),
);

describe("flowchart print → parse round-trip (property-based)", () => {
  it("parse(print(ast)) reproduces the ast", () => {
    fc.assert(
      fc.property(astArb, (ast) => {
        const printed = print(ast);
        const r = parse(printed);
        expect(isOk(r)).toBe(true);
        if (isOk(r)) expect(r.value).toEqual(ast);
      }),
    );
  });
});
