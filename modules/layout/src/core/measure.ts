import type { MeasureText } from "./graph.js";
import { point, type Point } from "@m/std";

// The widest measured line of a (possibly multi-line) label. `reduce`, not `Math.max(...spread)`:
// a spread over many lines would hit the argument-count limit (and throw) on a pathological label,
// breaking core totality. Seeds at 0, so an empty/whitespace label measures non-negative.
export const widestLine = (text: string, measure: MeasureText): number =>
  text.split("\n").reduce((w, line) => Math.max(w, measure(line)), 0);

// A label's box width: at least `min`, otherwise the widest line plus `pad` of horizontal padding.
// Single-line labels measure the same as the bare `measure(label)` the call sites used before.
export const clampedWidth = (
  text: string,
  measure: MeasureText,
  min: number,
  pad: number,
): number => Math.max(min, widestLine(text, measure) + pad);

export const selfLoopWaypoints = (b: {
  x: number;
  y: number;
  w: number;
  h: number;
}): readonly [Point, Point, Point, Point, Point] => {
  const LOOP_SIZE = 24;
  return [
    point(b.x + b.w * 0.7, b.y),
    point(b.x + b.w * 0.7, b.y - LOOP_SIZE),
    point(b.x + b.w + LOOP_SIZE, b.y - LOOP_SIZE),
    point(b.x + b.w + LOOP_SIZE, b.y + b.h * 0.3),
    point(b.x + b.w, b.y + b.h * 0.3),
  ] as const;
};

export const selfLoopLabelPos = (b: { x: number; y: number; w: number; h: number }): Point => {
  const LOOP_SIZE = 24;
  return point(b.x + b.w + LOOP_SIZE, b.y - LOOP_SIZE);
};
