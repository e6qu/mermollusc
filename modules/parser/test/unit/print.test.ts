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
        { id: nid("A"), label: "Start", shape: "round" , icon: null },
        { id: nid("B"), label: "Decision", shape: "diamond" , icon: null },
      ],
      edges: [{ id: eid("e0"), from: nid("A"), to: nid("B"), kind: "arrow", label: "go" }],
      subgraphs: [],
      styles: [],
    };
    expect(print(ast)).toBe("flowchart LR\n  A(Start)\n  B{Decision}\n  A -->|go| B\n");
  });

  it("renders a subgraph block with its members, then edges", () => {
    const ast: FlowchartAst = {
      kind: "flowchart",
      direction: "TB",
      nodes: [
        { id: nid("api"), label: "API", shape: "rect" , icon: null },
        { id: nid("user"), label: "User", shape: "rect" , icon: null },
      ],
      edges: [{ id: eid("e0"), from: nid("user"), to: nid("api"), kind: "arrow", label: null }],
      subgraphs: [{ id: nid("Backend"), label: "Backend", parent: null, nodes: [nid("api")] }],
      styles: [],
    };
    expect(print(ast)).toBe(
      "flowchart TB\n  user[User]\n  subgraph Backend\n    api[API]\n  end\n  user --> api\n",
    );
  });
});
