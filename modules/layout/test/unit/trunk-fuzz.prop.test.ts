import fc from "fast-check";
import { brand, point, rect, twoOrMore, type Point } from "@m/std";
import type { Scene, SceneEdge, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { respreadPorts, trunkRoutes } from "../../src/core/route.js";

// A graph fuzzer for the backbone routers (trunk + bus). It builds random non-overlapping node grids
// with a random mix of DIRECTED (`-->`) and UNDIRECTED (`---`) edges, routes them, and checks the
// project rule: a shared backbone (a coincident collinear segment carrying ≥2 edges) may only merge
// COMPATIBLE edges — never a directed with an undirected one, never two directed edges flowing opposite
// ways. Complex graphs are where the overlaps hide, so we push node/edge counts up.
//
// PROGRESS (2026-07-12): `offsetParallelEdges` spreads ALL multi-edges between one node pair onto
// distinct lanes — STRAIGHT pairs by a whole-route translate and BENT (L-route) pairs by a per-segment
// perpendicular shift (each corner takes both its x- and y-offset), so a directed+undirected pair or an
// A→B/B→A pair no longer shares a backbone whether the nodes are aligned or diagonal (guarded by
// `NOW_CLEAN`). STILL OPEN: cross-node channel alignment in complex graphs — edges between DIFFERENT
// pairs whose legs land on one track; that needs signature-aware lanes in the base router. The two
// property tests below stay `it.fails` (they PASS while ANY violation remains and FLIP to failing the
// day the router is fully fixed — the signal to drop `.fails` and promote them to real gates). See
// modules/layout/DO_NEXT.md.

const nodeAt = (id: string, x: number, y: number, w = 60, h = 40): SceneNode => ({
  id: brand<string, "SceneNodeId">(id),
  bounds: rect(x, y, w, h),
  label: id,
  shape: "rect",
  parent: null,
  icon: null,
  rows: null,
  rowDivider: null,
  subtitle: null,
  accent: "none",
  role: "normal",
});

const edgeOf = (id: string, from: string, to: string, directed: boolean): SceneEdge => ({
  id: brand<string, "SceneEdgeId">(id),
  from: brand<string, "SceneNodeId">(from),
  to: brand<string, "SceneNodeId">(to),
  waypoints: twoOrMore(point(0, 0), point(1, 1)),
  label: null,
  stroke: "solid",
  fromEnd: "none",
  toEnd: directed ? "arrow" : "none",
  curved: false,
  fromLabel: null,
  toLabel: null,
  accent: "none",
  labelPos: null,
});

interface GraphSpec {
  readonly nodeCount: number;
  readonly edges: ReadonlyArray<{ readonly a: number; readonly b: number; readonly directed: boolean }>;
}

// Nodes on a spaced grid so no two boxes overlap (the router assumes non-overlapping nodes).
export const buildFuzzScene = (spec: GraphSpec): Scene => {
  const n = spec.nodeCount;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const nodes: SceneNode[] = [];
  for (let i = 0; i < n; i++) {
    nodes.push(nodeAt(`n${i}`, (i % cols) * 160 + 20, Math.floor(i / cols) * 120 + 20));
  }
  const edges: SceneEdge[] = [];
  spec.edges.forEach((e, i) => {
    if (e.a !== e.b && e.a < n && e.b < n) edges.push(edgeOf(`e${i}`, `n${e.a}`, `n${e.b}`, e.directed));
  });
  const rows = Math.ceil(n / cols);
  return { nodes, edges, wedges: [], decorations: [], extent: rect(0, 0, cols * 160 + 40, rows * 120 + 40) };
};

// Compatibility signature of an edge on a given axis: undirected → "U"; directed → the flow direction
// along that axis (from `from`-centre toward the arrowhead). Two coincident segments conflict iff their
// signatures differ.
const centreX = new Map<string, number>();
const centreY = new Map<string, number>();
const signature = (e: SceneEdge, horizontal: boolean): string => {
  const arrowAtTo = e.toEnd === "arrow";
  const arrowAtFrom = e.fromEnd === "arrow";
  if (!arrowAtTo && !arrowAtFrom) return "U";
  const src = arrowAtTo ? e.from : e.to;
  const dst = arrowAtTo ? e.to : e.from;
  if (horizontal) return (centreX.get(dst) ?? 0) - (centreX.get(src) ?? 0) >= 0 ? "D>" : "D<";
  return (centreY.get(dst) ?? 0) - (centreY.get(src) ?? 0) >= 0 ? "Dv" : "D^";
};

interface Seg {
  readonly edge: SceneEdge;
  readonly horizontal: boolean;
  readonly fixed: number;
  readonly lo: number;
  readonly hi: number;
}
const segmentsOf = (e: SceneEdge): Seg[] => {
  const out: Seg[] = [];
  const w = e.waypoints;
  for (let i = 0; i + 1 < w.length; i++) {
    const a = w[i] as Point;
    const b = w[i + 1] as Point;
    if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) >= 0.5)
      out.push({ edge: e, horizontal: true, fixed: Math.round(a.y), lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
    else if (Math.abs(a.x - b.x) < 0.5)
      out.push({ edge: e, horizontal: false, fixed: Math.round(a.x), lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
  }
  return out;
};

const MERGE_TOL = 2;
const OVERLAP_MIN = 8;

// The first incompatible shared backbone in a routed scene, or null if the rule holds.
export const incompatibleBackbone = (scene: Scene): string | null => {
  centreX.clear();
  centreY.clear();
  for (const nd of scene.nodes) {
    centreX.set(nd.id, nd.bounds.origin.x + nd.bounds.size.width / 2);
    centreY.set(nd.id, nd.bounds.origin.y + nd.bounds.size.height / 2);
  }
  const segs = scene.edges.flatMap(segmentsOf);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i] as Seg;
      const B = segs[j] as Seg;
      if (A.edge.id === B.edge.id || A.horizontal !== B.horizontal) continue;
      if (Math.abs(A.fixed - B.fixed) > MERGE_TOL) continue;
      if (Math.min(A.hi, B.hi) - Math.max(A.lo, B.lo) <= OVERLAP_MIN) continue;
      const sa = signature(A.edge, A.horizontal);
      const sb = signature(B.edge, B.horizontal);
      if (sa !== sb) {
        return `${A.edge.from}->${A.edge.to}(${sa}) & ${B.edge.from}->${B.edge.to}(${sb}) share a ${A.horizontal ? "horizontal" : "vertical"} backbone`;
      }
    }
  }
  return null;
};

const graph: fc.Arbitrary<GraphSpec> = fc.record({
  nodeCount: fc.integer({ min: 3, max: 9 }),
  edges: fc.array(
    fc.record({ a: fc.integer({ min: 0, max: 8 }), b: fc.integer({ min: 0, max: 8 }), directed: fc.boolean() }),
    { minLength: 2, maxLength: 14 },
  ),
});

// Multi-edge offsetting (`offsetParallelEdges`) fixed these — they must STAY clean in both backbone
// modes (a directed + undirected pair, an opposite pair, a mixed hub — all edges between one node pair,
// whether the two nodes are aligned (straight route) or diagonal (bent L-route)).
const NOW_CLEAN: ReadonlyArray<{ readonly name: string; readonly spec: GraphSpec }> = [
  {
    name: "opposite-direction pair between the same two nodes",
    spec: { nodeCount: 6, edges: [{ a: 4, b: 1, directed: true }, { a: 1, b: 4, directed: true }] },
  },
  {
    name: "hub with a directed and an undirected edge from the same source",
    spec: {
      nodeCount: 3,
      edges: [
        { a: 0, b: 2, directed: true },
        { a: 1, b: 2, directed: false },
        { a: 0, b: 2, directed: false },
      ],
    },
  },
  {
    name: "bent (diagonal) directed + undirected pair — L-route, needs per-segment spread",
    spec: {
      nodeCount: 4,
      edges: [
        { a: 0, b: 3, directed: true },
        { a: 0, b: 3, directed: false },
      ],
    },
  },
];

describe("backbone routing fuzz — no incompatible edge sharing a trunk (trunk + bus)", () => {
  // KNOWN BUG: still failing. `it.fails` passes while the violation exists; remove `.fails` when fixed.
  it.fails("trunk routing never merges incompatible edges onto one backbone", () => {
    fc.assert(
      fc.property(graph, (spec) => incompatibleBackbone(trunkRoutes(buildFuzzScene(spec))) === null),
      { numRuns: 400, seed: 42 },
    );
  });

  it.fails("bus routing never merges incompatible edges onto one backbone", () => {
    fc.assert(
      fc.property(graph, (spec) => incompatibleBackbone(respreadPorts(buildFuzzScene(spec), true)) === null),
      { numRuns: 400, seed: 42 },
    );
  });

  // Regression guard for the multi-edge cases the offset pass fixed — these must never re-break.
  it("multi-edge cases stay clean of incompatible backbones (trunk + bus)", () => {
    for (const r of NOW_CLEAN) {
      expect(incompatibleBackbone(trunkRoutes(buildFuzzScene(r.spec))), `trunk: ${r.name}`).toBeNull();
      expect(incompatibleBackbone(respreadPorts(buildFuzzScene(r.spec), true)), `bus: ${r.name}`).toBeNull();
    }
  });
});
