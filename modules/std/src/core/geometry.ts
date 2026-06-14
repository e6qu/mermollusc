// Lengths and coordinates are branded `Px`; constructors live in the shell.

import type { Brand } from "./brand.js";

export type Px = Brand<number, "Px">;

export interface Point {
  readonly x: Px;
  readonly y: Px;
}
export interface Size {
  readonly width: Px;
  readonly height: Px;
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
