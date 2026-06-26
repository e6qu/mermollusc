import { point, type Point } from "@m/std";
import { describe, expect, it } from "vitest";
import { mazeRoute, type MazeBox } from "../../src/core/maze.js";

const box = (x: number, y: number, w: number, h: number): MazeBox => ({ x, y, w, h });

const throughAny = (path: readonly Point[], obstacles: readonly MazeBox[]): boolean => {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a === undefined || b === undefined) continue;
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    for (const o of obstacles) {
      if (x0 < o.x + o.w && x1 > o.x && y0 < o.y + o.h && y1 > o.y) return true;
    }
  }
  return false;
};
const orthogonal = (path: readonly Point[]): boolean => {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a !== undefined && b !== undefined && a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
};

describe("mazeRoute", () => {
  it("routes a straight clear shot with no intermediate bends", () => {
    const path = mazeRoute(point(0, 50), point(200, 50), [], 8);
    expect(path).not.toBeNull();
    if (path === null) return;
    expect(path[0]).toEqual(point(0, 50));
    expect(path[path.length - 1]).toEqual(point(200, 50));
    expect(orthogonal(path)).toBe(true);
  });

  it("bends around a single obstacle sitting on the straight line", () => {
    const obstacles = [box(90, 30, 40, 40)]; // straddles y=50 between x90..130
    const path = mazeRoute(point(0, 50), point(220, 50), obstacles, 8);
    expect(path).not.toBeNull();
    if (path === null) return;
    expect(orthogonal(path)).toBe(true);
    expect(throughAny(path, obstacles)).toBe(false); // detours cleanly
    expect(path.length).toBeGreaterThan(2); // it had to bend
  });

  it("threads past a staggered wall of obstacles (multi-bend)", () => {
    const obstacles = [box(80, 0, 30, 80), box(150, 60, 30, 80)];
    const path = mazeRoute(point(0, 50), point(260, 50), obstacles, 10);
    expect(path).not.toBeNull();
    if (path === null) return;
    expect(orthogonal(path)).toBe(true);
    expect(throughAny(path, obstacles)).toBe(false);
  });

  it("returns endpoints in order and is deterministic (same input → same path)", () => {
    const obstacles = [box(90, 30, 40, 40)];
    const a = mazeRoute(point(0, 50), point(220, 50), obstacles, 8);
    const b = mazeRoute(point(0, 50), point(220, 50), obstacles, 8);
    expect(a).toEqual(b);
  });
});
