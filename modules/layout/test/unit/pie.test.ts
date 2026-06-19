import { brand } from "@m/std";
import type { PieAst } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutPie } from "../../src/core/pie.js";

const sid = (s: string) => brand<string, "PieSliceId">(s);

const ast: PieAst = {
  kind: "pie",
  title: "Pets",
  showData: false,
  slices: [
    { id: sid("s0"), label: "Dogs", value: 75 },
    { id: sid("s1"), label: "Cats", value: 25 },
  ],
};

describe("layoutPie", () => {
  const result = layoutPie(ast, heuristicMeasure);
  if (!result.ok) throw new Error(result.error.message);
  const scene = result.value;

  it("emits one wedge per slice and no nodes/edges", () => {
    expect(scene.nodes).toHaveLength(0);
    expect(scene.edges).toHaveLength(0);
    expect(scene.wedges).toHaveLength(2);
  });

  it("sizes wedges by their share of the total and starts at 12 o'clock", () => {
    const [dogs, cats] = scene.wedges;
    expect(dogs?.percent).toBeCloseTo(75);
    expect(cats?.percent).toBeCloseTo(25);
    // First slice begins at the top (canvas angle -π/2).
    expect(dogs?.startAngle).toBeCloseTo(-Math.PI / 2);
    // 75% of the circle is 1.5π; the first slice ends there, the second continues from it.
    expect((dogs?.endAngle ?? 0) - (dogs?.startAngle ?? 0)).toBeCloseTo(0.75 * 2 * Math.PI);
    expect(cats?.startAngle).toBeCloseTo(dogs?.endAngle ?? 0);
  });

  it("the wedges together sweep a full turn", () => {
    const first = scene.wedges[0];
    const last = scene.wedges[scene.wedges.length - 1];
    expect((last?.endAngle ?? 0) - (first?.startAngle ?? 0)).toBeCloseTo(2 * Math.PI);
  });

  it("assigns a distinct colour index per slice in order", () => {
    expect(scene.wedges.map((w) => w.colorIndex)).toEqual([0, 1]);
  });

  it("returns an empty (but valid) scene for a title-only pie", () => {
    const empty = layoutPie(
      { kind: "pie", title: "Empty", showData: false, slices: [] },
      heuristicMeasure,
    );
    if (!empty.ok) throw new Error(empty.error.message);
    expect(empty.value.wedges).toHaveLength(0);
    expect(empty.value.extent.size.width).toBeGreaterThan(0);
  });
});
