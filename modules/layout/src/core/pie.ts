import { ok, point, rect, type Result } from "@m/std";
import type { PieAst, Scene, SceneWedge } from "@m/contracts";
import type { LayoutError, MeasureText } from "./graph.js";

const RADIUS = 150;
const DONUT_INNER_RADIUS = 72;
const MARGIN = 24;
const SWATCH_R = 7; // legend colour-disc radius
const LEGEND_GAP = 28; // between the pie's right edge and the legend column
const ROW_H = 26; // legend row pitch
const LABEL_GAP = 8; // swatch → legend-label gap (mirrors the renderer's LEGEND_LABEL_GAP)

// Deterministic pie layout — no ELK. Slices are sized by their share of the total and laid clockwise
// from 12 o'clock (canvas angle `-π/2`); angles are stored in canvas convention so the renderer draws
// them directly. Each slice also gets a **legend** entry to the right: a full-circle wedge (the
// renderer draws that as a colour-disc swatch with its label to the right). The legend label carries
// the slice name, plus the raw value when `showData`. The on-slice label (the renderer adds it) is
// just the percentage, so even thin slices stay readable. No nodes/edges — only wedges.
export const layoutPie = (ast: PieAst, measure: MeasureText): Result<Scene, LayoutError> => {
  const total = ast.slices.reduce((sum, s) => sum + s.value, 0);
  const center = point(MARGIN + RADIUS, MARGIN + RADIUS);
  const discSpan = 2 * (MARGIN + RADIUS);

  // An empty pie (header only) or an all-zero total has nothing to draw; return an empty scene rather
  // than dividing by zero. The parser already rejects non-positive slice values.
  if (total <= 0) {
    return ok({
      nodes: [],
      edges: [],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, discSpan, discSpan),
    });
  }

  const TWO_PI = Math.PI * 2;
  const legendText = (label: string, value: number): string =>
    ast.showData ? `${label}  ${value}` : label;
  // reduce, not Math.max(...spread): a spread over every slice would exceed the argument-count limit
  // (and throw) on a very large pie — keeping the core total.
  const maxLabelW = ast.slices.reduce(
    (m, s) => Math.max(m, measure(legendText(s.label, s.value))),
    0,
  );
  // Wrap the legend into columns so a long list doesn't run off the bottom past the disc.
  const maxRows = Math.max(1, Math.floor((discSpan - 2 * MARGIN) / ROW_H));
  const colPitch = 2 * SWATCH_R + LABEL_GAP + maxLabelW + LEGEND_GAP;
  const legendX0 = discSpan + LEGEND_GAP + SWATCH_R;

  const slices: SceneWedge[] = [];
  const legend: SceneWedge[] = [];
  let angle = -Math.PI / 2; // 12 o'clock
  for (const [i, slice] of ast.slices.entries()) {
    const fraction = slice.value / total;
    const startAngle = angle;
    const endAngle = angle + fraction * TWO_PI;
    angle = endAngle;
    const percent = fraction * 100;
    slices.push({
      center,
      radius: RADIUS,
      innerRadius: ast.donut ? DONUT_INNER_RADIUS : 0,
      startAngle,
      endAngle,
      label: slice.label,
      value: slice.value,
      percent,
      colorIndex: i,
    });
    const col = Math.floor(i / maxRows);
    const row = i % maxRows;
    legend.push({
      center: point(legendX0 + col * colPitch, MARGIN + SWATCH_R + row * ROW_H),
      radius: SWATCH_R,
      innerRadius: 0,
      startAngle: 0,
      endAngle: TWO_PI,
      label: legendText(slice.label, slice.value),
      value: slice.value,
      percent,
      colorIndex: i,
    });
  }

  const columns = Math.max(1, Math.ceil(ast.slices.length / maxRows));
  const rows = Math.min(ast.slices.length, maxRows);
  const legendRight = legendX0 + (columns - 1) * colPitch + SWATCH_R + LABEL_GAP + maxLabelW;
  const legendBottom = MARGIN + rows * ROW_H;
  const width = Math.max(discSpan, legendRight + MARGIN);
  const height = Math.max(discSpan, legendBottom + MARGIN);

  return ok({
    nodes: [],
    edges: [],
    wedges: [...slices, ...legend],
    decorations: [],
    extent: rect(0, 0, width, height),
  });
};
