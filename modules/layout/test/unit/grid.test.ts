import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { gridGeometry } from "../../src/core/grid.js";

const params = fc.record({
  items: fc.array(fc.integer(), { maxLength: 30 }),
  columns: fc.integer({ min: 1, max: 8 }),
  cellWidth: fc.integer({ min: 1, max: 400 }),
  cellHeight: fc.integer({ min: 1, max: 400 }),
  gap: fc.integer({ min: 0, max: 80 }),
});

describe("gridGeometry", () => {
  it("pairs every item with a cell in input order, preserving count", () => {
    fc.assert(
      fc.property(params, ({ items, columns, cellWidth, cellHeight, gap }) => {
        const g = gridGeometry(items, columns, cellWidth, cellHeight, gap);
        expect(g.positions.map((p) => p.item)).toEqual(items);
      }),
    );
  });

  it("places cell i at column i%columns, row floor(i/columns) with the given pitch", () => {
    fc.assert(
      fc.property(params, ({ items, columns, cellWidth, cellHeight, gap }) => {
        const g = gridGeometry(items, columns, cellWidth, cellHeight, gap);
        g.positions.forEach((p, i) => {
          expect(p.x).toBe((i % columns) * (cellWidth + gap));
          expect(p.y).toBe(Math.floor(i / columns) * (cellHeight + gap));
        });
      }),
    );
  });

  it("keeps every cell box inside the extent and never reports below 1x1", () => {
    fc.assert(
      fc.property(params, ({ items, columns, cellWidth, cellHeight, gap }) => {
        const g = gridGeometry(items, columns, cellWidth, cellHeight, gap);
        expect(g.extent.width).toBeGreaterThanOrEqual(1);
        expect(g.extent.height).toBeGreaterThanOrEqual(1);
        for (const p of g.positions) {
          expect(p.x + cellWidth).toBeLessThanOrEqual(g.extent.width);
          expect(p.y + cellHeight).toBeLessThanOrEqual(g.extent.height);
        }
      }),
    );
  });

  it("empty input yields no cells and one empty cell's worth of extent", () => {
    // `usedColumns` floors at 1 and `rows` at 1, so the extent never collapses to zero — matching
    // the original per-diagram skeletons (an empty block/network reserved one cell of space).
    const g = gridGeometry([], 3, 50, 40, 10);
    expect(g.positions).toEqual([]);
    expect(g.extent).toEqual({ width: 50, height: 40 });
  });

  it("a single full row uses count columns; multiple rows stack with the gap", () => {
    const g = gridGeometry([0, 1, 2, 3], 2, 100, 30, 20);
    // 2 columns: width = 2*100 + 1*20 = 220; rows = 2: height = 2*30 + 1*20 = 80.
    expect(g.extent).toEqual({ width: 220, height: 80 });
  });
});
