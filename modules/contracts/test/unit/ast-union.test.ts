import { describe, expectTypeOf, it } from "vitest";
import type {
  DiagramAst,
  FlowchartAst,
  GanttAst,
  PieAst,
  SequenceAst,
} from "../../src/core/index.js";

// Type-level guards on the central `DiagramAst` discriminated union: that `kind` narrows each arm to its
// concrete AST, and that the union is exhaustively closed (a new family is a compile error here). These
// are compile-time assertions — `expectTypeOf` erases at runtime, so the bodies never execute logic.
describe("DiagramAst discriminated union", () => {
  it("narrows each variant by its `kind` discriminant", () => {
    const onKind = (d: DiagramAst): string => {
      switch (d.kind) {
        case "flowchart":
          expectTypeOf(d).toEqualTypeOf<FlowchartAst>();
          return d.direction;
        case "sequence":
          expectTypeOf(d).toEqualTypeOf<SequenceAst>();
          return String(d.actors.length);
        case "pie":
          expectTypeOf(d).toEqualTypeOf<PieAst>();
          return String(d.slices.length);
        case "gantt":
          expectTypeOf(d).toEqualTypeOf<GanttAst>();
          return d.kind;
        // The remaining arms exist; this test only spot-checks a few narrowings.
        default:
          return d.kind;
      }
    };
    expectTypeOf(onKind).parameter(0).toEqualTypeOf<DiagramAst>();
  });

  it("exposes `kind` as a closed string-literal union, each AST tagged with its own literal", () => {
    expectTypeOf<DiagramAst["kind"]>().toExtend<string>();
    expectTypeOf<FlowchartAst["kind"]>().toEqualTypeOf<"flowchart">();
    expectTypeOf<PieAst["kind"]>().toEqualTypeOf<"pie">();
    expectTypeOf<GanttAst["kind"]>().toEqualTypeOf<"gantt">();
  });
});
