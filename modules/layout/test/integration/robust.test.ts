import { brand, isOk } from "@m/std";
import type { ClassAst, ErAst, FlowchartAst } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutDiagram } from "../../src/shell/elk.js";

const emptyClass: ClassAst = { kind: "class", entities: [], relationships: [] };
const emptyEr: ErAst = { kind: "er", entities: [], relationships: [] };
const selfClass: ClassAst = {
  kind: "class",
  entities: [{ id: brand<string, "ClassEntityId">("A"), label: "A", stereotype: null, members: [] }],
  relationships: [{
    id: brand<string, "ClassRelId">("r0"),
    from: brand<string, "ClassEntityId">("A"),
    to: brand<string, "ClassEntityId">("A"),
    fromArrow: "none", toArrow: "arrowOpen", dashed: false, label: "",
  }],
};
const selfFlow: FlowchartAst = {
  kind: "flowchart", direction: "TB",
  nodes: [{ id: brand<string, "NodeId">("A"), label: "A", shape: "rect" }],
  edges: [{ id: brand<string, "EdgeId">("e0"), from: brand<string, "NodeId">("A"), to: brand<string, "NodeId">("A"), kind: "arrow", label: null }],
  subgraphs: [],
};

describe("layout robustness probe", () => {
  for (const [name, ast] of [["empty class", emptyClass], ["empty er", emptyEr], ["self class", selfClass], ["self flow", selfFlow]] as const) {
    it(`lays out without throwing: ${name}`, async () => {
      const r = await layoutDiagram(ast, heuristicMeasure);
      expect(isOk(r)).toBe(true);
    });
  }
});
