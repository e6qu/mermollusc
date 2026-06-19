import { ok, point, rect, type Result } from "@m/std";
import type { PieAst, Scene, SceneWedge } from "@m/contracts";
import type { LayoutError, MeasureText } from "./graph.js";

const RADIUS = 150;
const MARGIN = 24;

// Deterministic pie layout — no ELK. Slices are sized by their share of the total and laid clockwise
// from 12 o'clock (canvas angle `-π/2`). Angles are stored in canvas convention (radians from +x,
// clockwise) so the renderer draws them without re-deriving anything. No nodes/edges — only wedges.
export const layoutPie = (ast: PieAst, _measure: MeasureText): Result<Scene, LayoutError> => {
  const total = ast.slices.reduce((sum, s) => sum + s.value, 0);
  const center = point(MARGIN + RADIUS, MARGIN + RADIUS);
  const extent = rect(0, 0, 2 * (MARGIN + RADIUS), 2 * (MARGIN + RADIUS));

  // An empty pie (header only) or an all-zero total has nothing to draw; return an empty scene rather
  // than dividing by zero. The parser already rejects non-positive slice values, so a positive total
  // is the normal case.
  if (total <= 0) {
    return ok({ nodes: [], edges: [], wedges: [], extent });
  }

  const TWO_PI = Math.PI * 2;
  let angle = -Math.PI / 2; // 12 o'clock
  const wedges: SceneWedge[] = ast.slices.map((slice, i) => {
    const fraction = slice.value / total;
    const startAngle = angle;
    const endAngle = angle + fraction * TWO_PI;
    angle = endAngle;
    return {
      center,
      radius: RADIUS,
      startAngle,
      endAngle,
      label: slice.label,
      value: slice.value,
      percent: fraction * 100,
      colorIndex: i,
    };
  });

  return ok({ nodes: [], edges: [], wedges, extent });
};
