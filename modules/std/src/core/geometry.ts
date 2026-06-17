// Pixel scalars split by role: a `Coordinate` is a signed position; a `Length` is a non-negative
// extent. Keeping them distinct means a length can never be silently negative, and a position can't
// be mistaken for a size. Constructors (and `Length`'s ≥0 validation) live in the shell.

import type { Brand } from "./brand.js";

export type Coordinate = Brand<number, "Coordinate">;
export type Length = Brand<number, "Length">;

export interface Point {
  readonly x: Coordinate;
  readonly y: Coordinate;
}
export interface Size {
  readonly width: Length;
  readonly height: Length;
}
export interface Rect {
  readonly origin: Point;
  readonly size: Size;
}

export const rectContains = (r: Rect, p: Point): boolean =>
  p.x >= r.origin.x &&
  p.y >= r.origin.y &&
  p.x <= r.origin.x + r.size.width &&
  p.y <= r.origin.y + r.size.height;
