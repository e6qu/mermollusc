import { brand, isOk } from "@m/std";
import type { FlowchartAst } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { layout } from "../../src/shell/elk.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

describe("layout", () => {
  it("positions a small flowchart into a non-degenerate scene", async () => {
    const ast: FlowchartAst = {
      kind: "flowchart",
      direction: "TB",
      nodes: [
        { id: nid("A"), label: "Start", shape: "rect" },
        { id: nid("B"), label: "End", shape: "round" },
      ],
      edges: [{ id: eid("e0"), from: nid("A"), to: nid("B"), kind: "arrow", label: null }],
    };

    const r = await layout(ast);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    expect(r.value.nodes).toHaveLength(2);
    expect(r.value.edges).toHaveLength(1);
    const a = r.value.nodes[0];
    const b = r.value.nodes[1];
    if (a === undefined || b === undefined) throw new Error("missing nodes");
    expect(a.bounds.origin.y).not.toBe(b.bounds.origin.y);
    expect(r.value.edges[0]?.waypoints.length ?? 0).toBeGreaterThan(0);
    expect(r.value.extent.size.width).toBeGreaterThan(0);
  });
});
