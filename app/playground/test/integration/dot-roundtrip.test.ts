import { heuristicMeasure, layoutDiagram } from "@m/layout";
import { parseDiagram, parseDot } from "@m/parser";
import { toDot } from "@m/renderer";
import { isOk } from "@m/std";
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
