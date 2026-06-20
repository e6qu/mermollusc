// Sanctioned boundary: brand() is the only `as` cast in @m/std. Typed constructors route
// through it so consuming cores call px(n) etc. and never write `as` themselves.

import type { Brand } from "../core/brand.js";
import type { Coordinate, Length, Point, Rect, Size } from "../core/geometry.js";

export const brand = <TBase, TTag extends string>(value: TBase): Brand<TBase, TTag> =>
  value as Brand<TBase, TTag>;

export const coordinate = (n: number): Coordinate => brand<number, "Coordinate">(n);

// A length is finite and non-negative by construction — fail loud otherwise, so a bad size surfaces
// at its source rather than silently producing an inverted (or NaN) box downstream. The guard is
// written `>= 0` so NaN — which compares false to everything — is rejected too; a bare `< 0` would
// let `length(NaN)` slip through.
export const length = (n: number): Length => {
  if (!(n >= 0) || !Number.isFinite(n)) {
    throw new RangeError(`length must be a finite non-negative number, got ${n}`);
  }
  return brand<number, "Length">(n);
};

export const point = (x: number, y: number): Point => ({ x: coordinate(x), y: coordinate(y) });
export const size = (width: number, height: number): Size => ({
  width: length(width),
  height: length(height),
});
export const rect = (x: number, y: number, width: number, height: number): Rect => ({
  origin: point(x, y),
  size: size(width, height),
});
