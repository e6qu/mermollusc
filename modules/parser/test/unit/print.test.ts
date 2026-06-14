import { brand } from "@m/std";
import type { FlowchartAst } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { print } from "../../src/core/print.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

describe("print", () => {
  it("renders nodes by shape and an edge with a label", () => {
    const ast: FlowchartAst = {
      kind: "flowchart",
      direction: "LR",
      nodes: [
        { id: nid("A"), label: "Start", shape: "round" },
        { id: nid("B"), label: "Decision", shape: "diamond" },
      ],
      edges: [{ id: eid("e0"), from: nid("A"), to: nid("B"), kind: "arrow", label: "go" }],
    };
    expect(print(ast)).toBe("flowchart LR\n  A(Start)\n  B{Decision}\n  A -->|go| B\n");
  });
});
