import type { SceneNodeId } from "@m/contracts";

// Align/distribute geometry for the editor's Arrange actions. Pure: unit boxes in, per-leaf
// translations out — the host owns what a "unit" is (a loose node, or a whole group whose leaves move
// together so the group keeps its internal layout).

export type AlignKind =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "centerX"
  | "centerY"
  | "distH"
  | "distV";

export interface UnitBox {
  readonly leaves: readonly SceneNodeId[];
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

// Fold-based min/max — never `Math.min(...arr)`, whose argument spread throws (RangeError) once the
// array is large enough (a select-all-then-align on a big diagram would hit that limit).
const minOf = (ns: readonly number[]): number =>
  ns.reduce((m, n) => Math.min(m, n), Number.POSITIVE_INFINITY);
const maxOf = (ns: readonly number[]): number =>
  ns.reduce((m, n) => Math.max(m, n), Number.NEGATIVE_INFINITY);

// The per-leaf translation that aligns/distributes the unit boxes. Distribute spaces the unit
// centres evenly between the extreme units (which stay put); align snaps an edge or centre axis.
export const arrangeDeltas = (
  kind: AlignKind,
  units: readonly UnitBox[],
): Map<SceneNodeId, { readonly dx: number; readonly dy: number }> => {
  const deltas = new Map<SceneNodeId, { readonly dx: number; readonly dy: number }>();
  const put = (u: UnitBox, dx: number, dy: number): void => {
    for (const leaf of u.leaves) deltas.set(leaf, { dx, dy });
  };
  const lefts = units.map((u) => u.x);
  const rights = units.map((u) => u.x + u.w);
  const tops = units.map((u) => u.y);
  const bottoms = units.map((u) => u.y + u.h);
  switch (kind) {
    case "left": {
      const t = minOf(lefts);
      for (const u of units) put(u, t - u.x, 0);
      break;
    }
    case "right": {
      const t = maxOf(rights);
      for (const u of units) put(u, t - u.w - u.x, 0);
      break;
    }
    case "top": {
      const t = minOf(tops);
      for (const u of units) put(u, 0, t - u.y);
      break;
    }
    case "bottom": {
      const t = maxOf(bottoms);
      for (const u of units) put(u, 0, t - u.h - u.y);
      break;
    }
    case "centerX": {
      const axis = (minOf(lefts) + maxOf(rights)) / 2;
      for (const u of units) put(u, axis - u.w / 2 - u.x, 0);
      break;
    }
    case "centerY": {
      const axis = (minOf(tops) + maxOf(bottoms)) / 2;
      for (const u of units) put(u, 0, axis - u.h / 2 - u.y);
      break;
    }
    case "distH": {
      const sorted = [...units].sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (first === undefined || last === undefined) break;
      const lo = first.x + first.w / 2;
      const step = (last.x + last.w / 2 - lo) / (sorted.length - 1);
      sorted.forEach((u, i) => {
        put(u, lo + i * step - u.w / 2 - u.x, 0);
      });
      break;
    }
    case "distV": {
      const sorted = [...units].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (first === undefined || last === undefined) break;
      const lo = first.y + first.h / 2;
      const step = (last.y + last.h / 2 - lo) / (sorted.length - 1);
      sorted.forEach((u, i) => {
        put(u, 0, lo + i * step - u.h / 2 - u.y);
      });
      break;
    }
  }
  return deltas;
};
