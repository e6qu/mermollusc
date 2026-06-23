import fc from "fast-check";
import { brand, rect } from "@m/std";
import type { Scene, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { snapAxis, snapCandidates, SNAP_T } from "../../src/core/snap.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);

const nodeOf = (id: string, x: number, y: number, w: number, h: number): SceneNode => ({
  id: snid(id),
  bounds: rect(x, y, w, h),
  label: id,
  shape: "rect",
  parent: null,
  icon: null,
  rowDivider: null,
  subtitle: null,
  accent: "none",
  role: "normal",
  rows: null,
});

const reals = fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true });

describe("snapAxis — alignment snap (property-based)", () => {
  it("never snaps beyond SNAP_T, and a snap lands the edge exactly on the line", () => {
    fc.assert(
      fc.property(
        fc.array(reals, { minLength: 1, maxLength: 6 }),
        fc.array(reals, { minLength: 0, maxLength: 6 }),
        (edges, targets) => {
          const { delta, line } = snapAxis(edges, targets);
          if (line === null) {
            expect(delta).toBe(0);
            return;
          }
          // The chosen line is a candidate, and some edge lands on it within tolerance.
          expect(targets).toContain(line);
          const landed = edges.some((e) => Math.abs(line - e) <= SNAP_T && line - e === delta);
          expect(landed).toBe(true);
        },
      ),
    );
  });

  it("returns no snap (null line, 0 delta) when there are no candidates", () => {
    fc.assert(
      fc.property(fc.array(reals, { minLength: 0, maxLength: 6 }), (edges) => {
        expect(snapAxis(edges, [])).toEqual({ delta: 0, line: null });
      }),
    );
  });

  it("picks the globally-closest candidate, first-seen-wins on a tie", () => {
    // Two candidate lines equidistant from the single edge: the strictly-less `<` comparison keeps the
    // first one scanned, so the earlier target in the array wins the tie.
    expect(snapAxis([10], [13, 7])).toEqual({ delta: 3, line: 13 });
    expect(snapAxis([10], [7, 13])).toEqual({ delta: -3, line: 7 });
    // A nearer candidate always beats a farther one regardless of order.
    expect(snapAxis([10], [13, 11])).toEqual({ delta: 1, line: 11 });
  });
});

describe("snapCandidates — guide lines from other nodes (property-based)", () => {
  it("excludes the dragged node and emits left/centre/right + top/middle/bottom per other node", () => {
    fc.assert(
      fc.property(fc.nat({ max: 5 }), (excerptIdx) => {
        const nodes = [
          nodeOf("a", 0, 0, 100, 40),
          nodeOf("b", 200, 50, 60, 80),
          nodeOf("c", -30, 300, 20, 20),
        ];
        const exceptId = snid(["a", "b", "c"][excerptIdx % 3] ?? "a");
        const { xs, ys } = snapCandidates(nodes, exceptId);
        const others = nodes.filter((n) => n.id !== exceptId);
        expect(xs).toHaveLength(others.length * 3);
        expect(ys).toHaveLength(others.length * 3);
        for (const n of others) {
          const { origin: o, size: s } = n.bounds;
          expect(xs).toEqual(expect.arrayContaining([o.x, o.x + s.width / 2, o.x + s.width]));
          expect(ys).toEqual(expect.arrayContaining([o.y, o.y + s.height / 2, o.y + s.height]));
        }
      }),
    );
  });

  it("yields no candidates for a scene of one node (the dragged one)", () => {
    const scene: Scene = {
      nodes: [nodeOf("solo", 0, 0, 50, 50)],
      edges: [],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 50, 50),
    };
    const { xs, ys } = snapCandidates(scene.nodes, snid("solo"));
    expect(xs).toEqual([]);
    expect(ys).toEqual([]);
    // And snapAxis over empty candidates is the no-snap case.
    expect(snapAxis([0], xs)).toEqual({ delta: 0, line: null });
  });
});
