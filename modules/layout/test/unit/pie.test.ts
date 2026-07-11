import { brand, positive } from "@m/std";
import type { PieAst, SceneWedge } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutPie, pieSlicesTileCircle } from "../../src/core/pie.js";

const sid = (s: string) => brand<string, "PieSliceId">(s);

const FULL = Math.PI * 2 - 1e-6;
const isSlice = (w: SceneWedge): boolean => w.endAngle - w.startAngle < FULL;
const isLegend = (w: SceneWedge): boolean => w.endAngle - w.startAngle >= FULL;

const ast: PieAst = {
  kind: "pie",
  title: "Pets",
  showData: false,
  donut: false,
  slices: [
    { id: sid("s0"), label: "Dogs", value: positive(75) },
    { id: sid("s1"), label: "Cats", value: positive(25) },
  ],
};

describe("layoutPie", () => {
  const result = layoutPie(ast, heuristicMeasure);
  if (!result.ok) throw new Error(result.error.message);
  const scene = result.value;
  const slices = scene.wedges.filter(isSlice);
  const legend = scene.wedges.filter(isLegend);

  it("emits a slice wedge + legend swatch + an invisible marker hit-node per slice (no edges)", () => {
    expect(scene.edges).toHaveLength(0);
    expect(slices).toHaveLength(2);
    expect(legend).toHaveLength(2);
    // One `marker` node per slice (the selectable/relabelable/deletable hit region), keyed by slice id.
    expect(scene.nodes).toHaveLength(2);
    expect(scene.nodes.every((n) => n.role === "marker")).toBe(true);
    expect(scene.nodes.map((n) => n.id)).toEqual(["s0", "s1"]);
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

  it("sets an inner radius for donut slices but not legend swatches", () => {
    const donut = layoutPie({ ...ast, donut: true }, heuristicMeasure);
    if (!donut.ok) throw new Error(donut.error.message);
    const donutSlices = donut.value.wedges.filter(isSlice);
    const swatches = donut.value.wedges.filter(isLegend);
    expect(donutSlices.every((w) => w.innerRadius > 0)).toBe(true);
    expect(swatches.every((w) => w.innerRadius === 0)).toBe(true);
  });

  it("wraps the legend into a second column when there are too many slices for one", () => {
    const many: PieAst = {
      kind: "pie",
      title: null,
      showData: false,
  donut: false,
      slices: Array.from({ length: 20 }, (_, i) => ({
        id: sid(`s${i}`),
        label: `slice ${i}`,
        value: positive(i + 1),
      })),
    };
    const laid = layoutPie(many, heuristicMeasure);
    if (!laid.ok) throw new Error(laid.error.message);
    const swatches = laid.value.wedges.filter(isLegend);
    const xs = new Set(swatches.map((w) => Math.round(w.center.x)));
    // more than one distinct column x ⇒ the legend wrapped
    expect(xs.size).toBeGreaterThan(1);
    // and the legend no longer runs far past the disc bottom
    expect(laid.value.extent.size.height).toBeLessThan(2 * (150 + 24) + 26);
  });

  it("returns an empty (but valid) scene for a title-only pie", () => {
    const empty = layoutPie(
      { kind: "pie", title: "Empty", showData: false,
  donut: false, slices: [] },
      heuristicMeasure,
    );
    if (!empty.ok) throw new Error(empty.error.message);
    expect(empty.value.wedges).toHaveLength(0);
    expect(empty.value.extent.size.width).toBeGreaterThan(0);
  });

  it("pieSlicesTileCircle holds for a real pie (slices tile 2π) and fails if a slice is dropped", () => {
    expect(pieSlicesTileCircle(scene)).toBe(true);
    expect(pieSlicesTileCircle({ ...scene, wedges: [] })).toBe(true); // vacuous: no wedges
    // Drop one slice from the pie-centre group → the remaining slices no longer tile the circle.
    const sliceCentreKey = `${Math.round(slices[0]?.center.x ?? 0)},${Math.round(slices[0]?.center.y ?? 0)}`;
    const firstSlice = slices[0];
    const broken = scene.wedges.filter(
      (w) => w !== firstSlice && `${Math.round(w.center.x)},${Math.round(w.center.y)}` === sliceCentreKey,
    );
    expect(pieSlicesTileCircle({ ...scene, wedges: broken })).toBe(false);
  });
});

describe("pie title", () => {
  it("emits the title as a centred caption above the disc; no caption when the title is null", () => {
    const titled = layoutPie(ast, heuristicMeasure);
    if (!titled.ok) throw new Error(titled.error.message);
    const cap = titled.value.decorations.flatMap((d) => (d.kind === "caption" ? [d] : []))[0];
    if (cap === undefined) throw new Error("title caption missing");
    expect(cap.text).toBe("Pets");
    expect(cap.align).toBe("center");
    const discTop = Math.min(...titled.value.wedges.map((w) => w.center.y - w.radius));
    expect(cap.at.y).toBeLessThan(discTop);
    const untitled = layoutPie({ ...ast, title: null }, heuristicMeasure);
    if (!untitled.ok) throw new Error(untitled.error.message);
    expect(untitled.value.decorations).toEqual([]);
  });
});
