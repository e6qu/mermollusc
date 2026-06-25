import { heuristicMeasure, layoutDiagram } from "@m/layout";
import { parseDiagram, parseDot } from "@m/parser";
import { toDot } from "@m/renderer";
import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";

// Export ↔ import round trip: a diagram laid out to a Scene, serialised to DOT, then re-imported
// should preserve the graph (node ids/labels and the edge set). Crosses parser + layout + renderer,
// so it lives in the app (the only module that may depend on all three).
const sceneToDot = async (text: string): Promise<string> => {
  const parsed = parseDiagram(text);
  if (!isOk(parsed)) throw new Error("parse failed");
  const laid = await layoutDiagram(parsed.value, heuristicMeasure);
  if (!isOk(laid)) throw new Error("layout failed");
  const rankdir = "direction" in parsed.value ? parsed.value.direction : null;
  return toDot(laid.value, rankdir);
};

describe("DOT export ↔ import round trip", () => {
  it("preserves a flowchart's nodes and edges through Scene → DOT → parseDot", async () => {
    const dot = await sceneToDot("flowchart TD\n  A[Start] --> B(Mid)\n  B --> C{End}\n");
    const back = parseDot(dot);
    expect(isOk(back)).toBe(true);
    if (!isOk(back)) return;
    expect(back.value.nodes.map((n) => n.label).sort()).toEqual(["End", "Mid", "Start"]);
    expect(back.value.edges).toHaveLength(2);
  });

  it("round-trips a DOT digraph back to an equivalent graph", async () => {
    const original = 'digraph { a [label="A"]\n a -> b -> c\n c -> a [label="loop"] }';
    const dot = await sceneToDot(original);
    const back = parseDot(dot);
    expect(isOk(back)).toBe(true);
    if (!isOk(back)) return;
    expect(back.value.nodes).toHaveLength(3);
    expect(back.value.edges).toHaveLength(3);
    expect(back.value.edges.some((e) => e.label === "loop")).toBe(true);
  });

  it("round-trips a subgraph as a DOT cluster (flowchart subgraph → cluster → FlowSubgraph)", async () => {
    const dot = await sceneToDot(
      "flowchart TD\n  subgraph S [Core]\n    a --> b\n  end\n  b --> c\n",
    );
    expect(dot).toContain("subgraph");
    expect(dot).toContain("cluster_");
    const back = parseDot(dot);
    expect(isOk(back)).toBe(true);
    if (!isOk(back)) return;
    // the cluster survives the round trip as a FlowSubgraph with its members
    expect(back.value.subgraphs.length).toBeGreaterThanOrEqual(1);
    const members = back.value.subgraphs.flatMap((s) => [...s.nodes]);
    expect(members).toContain(brand<string, "NodeId">("a"));
  });

  it("exports a pie as an empty graph — its slices are invisible markers, not nodes", async () => {
    const dot = await sceneToDot('pie\n  title T\n  "Cats" : 40\n  "Dogs" : 60\n');
    expect(dot).not.toContain("Cats"); // no orphan slice boxes
    const back = parseDot(dot);
    expect(isOk(back)).toBe(true);
    if (!isOk(back)) return;
    expect(back.value.nodes).toHaveLength(0);
  });

  it("keeps a cluster id stable across repeated export → import (no cluster_ growth)", async () => {
    const reExport = async (dot: string): Promise<string> => {
      const back = parseDot(dot);
      if (!isOk(back)) throw new Error("reparse failed");
      const laid = await layoutDiagram(back.value, heuristicMeasure);
      if (!isOk(laid)) throw new Error("relayout failed");
      return toDot(laid.value, back.value.direction);
    };
    const dot1 = await sceneToDot("flowchart TD\n  subgraph S [Core]\n    a --> b\n  end\n  b --> c\n");
    const dot2 = await reExport(dot1);
    const dot3 = await reExport(dot2);
    expect(dot2).not.toContain("cluster_cluster");
    expect(dot3).toBe(dot2); // a fixed point — the id doesn't grow another prefix each round
  });

  it("exports a node/edge family that isn't a flowchart (ER) as a DOT graph", async () => {
    const dot = await sceneToDot(
      "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ ITEM : has\n",
    );
    const back = parseDot(dot);
    expect(isOk(back)).toBe(true);
    if (!isOk(back)) return;
    // CUSTOMER, ORDER, ITEM all survive as nodes.
    expect(back.value.nodes.map((n) => n.label).sort()).toEqual(["CUSTOMER", "ITEM", "ORDER"]);
  });
});
