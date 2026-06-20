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

// A coordinate in *screen* space — viewport CSS px (what `getBoundingClientRect`, `clientX/Y` and
// `style.left/top` speak), deliberately a different brand from a scene `Coordinate`. Because the two
// aren't mutually assignable, a screen point can't be handed to a scene API (`moveNode`, `hitTest`, …)
// or vice versa without the explicit `sceneToScreen` / `scenePoint` conversion — the coordinate-space
// mix-up that drifted the inline editor off its target becomes a compile error.
export type ScreenCoord = Brand<number, "ScreenCoord">;
export interface ScreenPoint {
  readonly x: ScreenCoord;
  readonly y: ScreenCoord;
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
