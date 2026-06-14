// Sanctioned boundary: brand() is the only `as` cast in @m/std. Typed constructors route
// through it so consuming cores call px(n) etc. and never write `as` themselves.

import type { Brand } from "../core/brand.js";
import type { Point, Px, Rect, Size } from "../core/geometry.js";

export const brand = <TBase, TTag extends string>(value: TBase): Brand<TBase, TTag> =>
  value as Brand<TBase, TTag>;

export const px = (n: number): Px => brand<number, "Px">(n);
export const point = (x: number, y: number): Point => ({ x: px(x), y: px(y) });
export const size = (width: number, height: number): Size => ({
  width: px(width),
  height: px(height),
});
export const rect = (x: number, y: number, width: number, height: number): Rect => ({
  origin: point(x, y),
  size: size(width, height),
});
