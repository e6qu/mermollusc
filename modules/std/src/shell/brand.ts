// Sanctioned boundary: brand() is the only `as` cast in @m/std. Typed constructors route
// through it so consuming cores call px(n) etc. and never write `as` themselves.

import type { Brand } from "../core/brand.js";
import type {
  Coordinate,
  Length,
  Point,
  Rect,
  ScreenCoord,
  ScreenPoint,
  Size,
} from "../core/geometry.js";
import type { OneOrMore, Positive, PositiveInt, TwoOrMore } from "../core/refined.js";

export const brand = <TBase, TTag extends string>(value: TBase): Brand<TBase, TTag> =>
  value as Brand<TBase, TTag>;

// A finite number > 0. Written `> 0` (not `>= 0` minus zero) so a NaN — false to every comparison —
// is rejected along with zero and negatives.
export const positive = (n: number): Positive => {
  if (!(n > 0) || !Number.isFinite(n)) {
    throw new RangeError(`positive number (> 0) required, got ${n}`);
  }
  return brand<number, "Positive">(n);
};

// A finite integer ≥ 1. `Number.isInteger` rejects NaN/Infinity/fractions, so only a true ≥1 int passes.
export const positiveInt = (n: number): PositiveInt => {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`positive integer (>= 1) required, got ${n}`);
  }
  return brand<number, "PositiveInt">(n);
};

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

// Build a `TwoOrMore<T>` from an explicit first + second (+ any rest). The tuple-rest literal types
// itself as `[T, T, ...T[]]`, so this needs no assertion — and a caller can't pass fewer than two.
export const twoOrMore = <T>(first: T, second: T, ...rest: readonly T[]): TwoOrMore<T> => [
  first,
  second,
  ...rest,
];

// Build a `OneOrMore<T>` from an explicit first (+ any rest). Like `twoOrMore`, the tuple-rest literal
// types itself as `[T, ...T[]]`, so no assertion is needed and a caller can't pass an empty list.
export const oneOrMore = <T>(first: T, ...rest: readonly T[]): OneOrMore<T> => [first, ...rest];

// Screen-space (viewport CSS px) — unvalidated like `coordinate` (an overlay can sit off-screen, so
// negatives are legal), but a distinct brand so it can't be confused with a scene coordinate.
export const screenCoord = (n: number): ScreenCoord => brand<number, "ScreenCoord">(n);
export const screenPoint = (x: number, y: number): ScreenPoint => ({
  x: screenCoord(x),
  y: screenCoord(y),
});

export const point = (x: number, y: number): Point => ({ x: coordinate(x), y: coordinate(y) });
export const size = (width: number, height: number): Size => ({
  width: length(width),
  height: length(height),
});
export const rect = (x: number, y: number, width: number, height: number): Rect => ({
  origin: point(x, y),
  size: size(width, height),
});
