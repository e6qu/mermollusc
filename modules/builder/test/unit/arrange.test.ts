import { brand } from "@m/std";
import { describe, expect, it } from "vitest";
import { arrangeDeltas, type UnitBox } from "../../src/index.js";

const nid = (s: string) => brand<string, "SceneNodeId">(s);

const unit = (id: string, x: number, y: number, w = 20, h = 10): UnitBox => ({
  leaves: [nid(id)],
  x,
  y,
  w,
  h,
});

describe("arrangeDeltas", () => {
  const units = [unit("a", 0, 0), unit("b", 50, 30), unit("c", 120, 80)];

  it("left/right/top/bottom snap the matching edge of every unit to the extreme", () => {
    expect([...arrangeDeltas("left", units).values()].map((d) => d.dx)).toEqual([0, -50, -120]);
    expect([...arrangeDeltas("right", units).values()].map((d) => d.dx)).toEqual([120, 70, 0]);
    expect([...arrangeDeltas("top", units).values()].map((d) => d.dy)).toEqual([0, -30, -80]);
    expect([...arrangeDeltas("bottom", units).values()].map((d) => d.dy)).toEqual([80, 50, 0]);
  });

  it("centerX/centerY align unit centres on the shared axis, never moving the other coordinate", () => {
    const cx = arrangeDeltas("centerX", units);
    // Axis = (min left + max right) / 2 = (0 + 140) / 2 = 70 → each unit centre lands on 70.
    for (const u of units) {
      const d = cx.get(u.leaves[0] ?? nid(""));
      expect(d).toBeDefined();
      if (d === undefined) continue;
      expect(u.x + d.dx + u.w / 2).toBe(70);
      expect(d.dy).toBe(0);
    }
    const cy = arrangeDeltas("centerY", units);
    for (const u of units) {
      const d = cy.get(u.leaves[0] ?? nid(""));
      expect(d).toBeDefined();
      if (d === undefined) continue;
      expect(u.y + d.dy + u.h / 2).toBe(45); // (0 + 90) / 2
      expect(d.dx).toBe(0);
    }
  });

  it("distH spaces unit centres evenly; the extreme units stay put", () => {
    const d = arrangeDeltas("distH", units);
    const centres = units
      .map((u) => u.x + (d.get(u.leaves[0] ?? nid(""))?.dx ?? Number.NaN) + u.w / 2)
      .sort((p, q) => p - q);
    const [c0, c1, c2] = centres;
    if (c0 === undefined || c1 === undefined || c2 === undefined) throw new Error("missing centre");
    expect(c1 - c0).toBeCloseTo(c2 - c1);
    expect(c0).toBe(10); // first unit centre unchanged
    expect(c2).toBe(130); // last unit centre unchanged
  });

  it("distV spaces unit centres evenly on the y axis", () => {
    const d = arrangeDeltas("distV", units);
    const centres = units
      .map((u) => u.y + (d.get(u.leaves[0] ?? nid(""))?.dy ?? Number.NaN) + u.h / 2)
      .sort((p, q) => p - q);
    const [c0, c1, c2] = centres;
    if (c0 === undefined || c1 === undefined || c2 === undefined) throw new Error("missing centre");
    expect(c1 - c0).toBeCloseTo(c2 - c1);
  });

  it("a multi-leaf unit moves all its leaves by the same delta (a group keeps its internal layout)", () => {
    const grouped: UnitBox = { leaves: [nid("g1"), nid("g2")], x: 40, y: 0, w: 30, h: 10 };
    const d = arrangeDeltas("left", [unit("solo", 0, 0), grouped]);
    expect(d.get(nid("g1"))).toEqual(d.get(nid("g2")));
    expect(d.get(nid("g1"))?.dx).toBe(-40);
  });
});
