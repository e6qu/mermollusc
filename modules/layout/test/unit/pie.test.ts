import { brand } from "@m/std";
import type { PieAst, SceneWedge } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutPie } from "../../src/core/pie.js";

const sid = (s: string) => brand<string, "PieSliceId">(s);

const FULL = Math.PI * 2 - 1e-6;
const isSlice = (w: SceneWedge): boolean => w.endAngle - w.startAngle < FULL;
const isLegend = (w: SceneWedge): boolean => w.endAngle - w.startAngle >= FULL;

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
  const slices = scene.wedges.filter(isSlice);
  const legend = scene.wedges.filter(isLegend);

  it("emits a slice wedge and a legend swatch per slice, and no nodes/edges", () => {
    expect(scene.nodes).toHaveLength(0);
    expect(scene.edges).toHaveLength(0);
    expect(slices).toHaveLength(2);
    expect(legend).toHaveLength(2);
  });

  it("sizes slices by their share of the total and starts at 12 o'clock", () => {
    const [dogs, cats] = slices;
    expect(dogs?.percent).toBeCloseTo(75);
    expect(cats?.percent).toBeCloseTo(25);
    expect(dogs?.startAngle).toBeCloseTo(-Math.PI / 2);
    expect((dogs?.endAngle ?? 0) - (dogs?.startAngle ?? 0)).toBeCloseTo(0.75 * 2 * Math.PI);
    expect(cats?.startAngle).toBeCloseTo(dogs?.endAngle ?? 0);
  });

  it("the slices together sweep a full turn", () => {
    const first = slices[0];
    const last = slices[slices.length - 1];
    expect((last?.endAngle ?? 0) - (first?.startAngle ?? 0)).toBeCloseTo(2 * Math.PI);
  });

  it("places legend swatches as full circles stacked in a column to the right of the disc", () => {
    expect(legend.map((w) => w.colorIndex)).toEqual([0, 1]);
    // same x (a column), increasing y (stacked), and right of the pie centre
    expect(legend[0]?.center.x).toBe(legend[1]?.center.x);
    expect((legend[1]?.center.y ?? 0) > (legend[0]?.center.y ?? 0)).toBe(true);
    expect((legend[0]?.center.x ?? 0) > (slices[0]?.center.x ?? 0)).toBe(true);
    // legend labels are just the names when showData is off
    expect(legend.map((w) => w.label)).toEqual(["Dogs", "Cats"]);
  });

  it("includes the raw value in the legend label when showData is on", () => {
    const withData = layoutPie({ ...ast, showData: true }, heuristicMeasure);
    if (!withData.ok) throw new Error(withData.error.message);
    const labels = withData.value.wedges.filter(isLegend).map((w) => w.label);
    expect(labels).toEqual(["Dogs  75", "Cats  25"]);
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
