import { heuristicMeasure, layoutDiagram } from "@m/layout";
import { parseDiagramWithSource } from "@m/parser";
import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";

// Regression guards for stack-overflows found by the pipeline fuzz: a source with two container
// declarations sharing an id, one nested inside the other, used to drive an id-keyed children map's
// recursion into the same bucket forever (`RangeError: Maximum call stack size exceeded`). Parsing
// must stay total and the layout must return a Result either way — never throw.
const NESTED_DUP: ReadonlyArray<{ readonly name: string; readonly text: string }> = [
  {
    name: "flowchart subgraph nested in its id-twin",
    text: "flowchart TD\n  subgraph X\n    subgraph X\n      a\n    end\n  end\n",
  },
  {
    name: "c4 boundary nested in its id-twin",
    text: 'C4Context\n  Boundary(b, "B") {\n    Boundary(b, "B") {\n      Container(x, "X")\n    }\n  }\n',
  },
  {
    name: "dot cluster nested in its id-twin",
    text: "digraph G {\n  subgraph cluster_x {\n    subgraph cluster_x {\n      a\n    }\n  }\n}\n",
  },
];

describe("overflow guards — duplicate-nested containers never crash the pipeline", () => {
  for (const { name, text } of NESTED_DUP) {
    it(`${name}: parse + layout stay total`, async () => {
      const parsed = parseDiagramWithSource(text);
      // A parse error is a valid loud outcome; if it parses, layout must not overflow.
      if (!isOk(parsed)) return;
      const laid = await layoutDiagram(parsed.value.ast, heuristicMeasure);
      expect(typeof laid.ok).toBe("boolean");
    });
  }
});
