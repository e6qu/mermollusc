import { brand, point, rect, twoOrMore } from "@m/std";
import { describe, expect, it } from "vitest";
import {
  boxCenter,
  decollideEdgeLabels,
  mazeRerouteEdges,
  respreadPorts,
  retidyRoutes,
  routeWaypoints,
  snapSceneEdgesToMountPoints,
  spreadPorts,
  trunkRoutes,
} from "../../src/core/route.js";
import { edgesAvoidContainerHeaders } from "../../src/core/invariants.js";

describe("routeWaypoints", () => {
  it("passes a full route through unchanged (≥2 points)", () => {
    const route = routeWaypoints(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      point(99, 99),
      point(88, 88),
    );
    expect(route).toEqual([point(0, 0), point(10, 0), point(10, 10)]);
  });

  it("falls back to a straight line between the endpoint centres for a degenerate (<2) route", () => {
    const fromC = point(5, 5);
    const toC = point(50, 5);
    expect(routeWaypoints([], fromC, toC)).toEqual([fromC, toC]);
    expect(routeWaypoints([{ x: 1, y: 1 }], fromC, toC)).toEqual([fromC, toC]);
  });
});

describe("boxCenter", () => {
  it("is the origin plus half the extent", () => {
    expect(boxCenter(10, 20, 40, 60)).toEqual(point(30, 50));
  });
});

describe("spreadPorts", () => {
  const node = (id: string, x: number, y: number) => ({
    id: brand<string, "SceneNodeId">(id),
    bounds: rect(x, y, 40, 30),
    label: id,
    shape: "rect" as const,
    parent: null,
    icon: null,
    rows: null,
    rowDivider: null,
    subtitle: null,
    accent: "none" as const,
    role: "normal" as const,
  });
  const edge = (id: string, from: string, to: string) => ({
    id: brand<string, "SceneEdgeId">(id),
    from: brand<string, "SceneNodeId">(from),
    to: brand<string, "SceneNodeId">(to),
    waypoints: twoOrMore(point(0, 0), point(1, 1)),
    label: null,
    stroke: "solid" as const,
    fromEnd: "none" as const,
    toEnd: "none" as const,
    curved: false,
    fromLabel: null,
    toLabel: null,
    labelPos: null,
  });

  it("gives edges sharing a node side distinct external lanes while using one mount point", () => {
    // three sources to the left, one target on the right — all enter the target's LEFT side.
    const scene = {
      nodes: [node("a", 0, 0), node("b", 0, 100), node("c", 0, 200), node("t", 300, 100)],
      edges: [edge("e0", "a", "t"), edge("e1", "b", "t"), edge("e2", "c", "t")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 340, 230),
    };
    const out = spreadPorts(scene);
    const entryPoints = out.edges.map((e) => e.waypoints[e.waypoints.length - 1]);
    const targetMounts = [point(340, 115), point(300, 115), point(320, 130), point(320, 100)];
    for (const entry of entryPoints) expect(targetMounts).toContainEqual(entry);
    const externalLanes = out.edges.map((e) => {
      const beforeMount = e.waypoints[e.waypoints.length - 2];
      return beforeMount === undefined ? "" : `${beforeMount.x}:${beforeMount.y}`;
    });
    expect(new Set(externalLanes).size).toBe(3);
    for (const e of out.edges) {
      const last = e.waypoints[e.waypoints.length - 1];
      expect(targetMounts).toContainEqual(last);
    }
  });

  // Reuse the energy module's geometry to assert "no leg passes through the obstacle box".
  type Boxed = { readonly bounds: ReturnType<typeof node>["bounds"] };
  const through = (a: { x: number; y: number }, b: { x: number; y: number }, box: Boxed): boolean => {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const bx = box.bounds.origin.x;
    const by = box.bounds.origin.y;
    return x0 < bx + box.bounds.size.width && x1 > bx && y0 < by + box.bounds.size.height && y1 > by;
  };
  const routeHitsObstacle = (wp: readonly { x: number; y: number }[], box: Boxed): boolean => {
    for (let i = 1; i < wp.length; i++) {
      const a = wp[i - 1];
      const b = wp[i];
      if (a !== undefined && b !== undefined && through(a, b, box)) return true;
    }
    return false;
  };

  it("reroutes around a node sitting directly on the straight A→B line (obstacle avoidance)", () => {
    // A and B are horizontally aligned; M sits squarely between them, on the direct line.
    const a = node("a", 0, 100);
    const m = node("m", 150, 100); // obstacle, dead centre between a (x0) and b (x300)
    const b = node("b", 300, 100);
    const scene = {
      nodes: [a, m, b],
      edges: [edge("e0", "a", "b")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 340, 200),
    };
    const out = spreadPorts(scene);
    const wp = out.edges[0]?.waypoints ?? [];
    // The straight route would gore M; the detour must clear it while still joining a → b.
    expect(routeHitsObstacle(wp, m)).toBe(false);
    expect(wp.length).toBeGreaterThanOrEqual(2);
  });

  it("mazeRerouteEdges bends an already-routed edge around a node it would cross, leaving clear ones", () => {
    const a = node("a", 0, 100);
    const m = node("m", 150, 100);
    const b = node("b", 300, 100);
    // An edge already routed as a straight line through m (as ELK output might leave it).
    const crossing = { ...edge("e0", "a", "b"), waypoints: twoOrMore(point(40, 115), point(300, 115)) };
    const clear = { ...edge("e1", "a", "b"), waypoints: twoOrMore(point(20, 0), point(20, 80)) };
    const scene = {
      nodes: [a, m, b],
      edges: [crossing, clear],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 340, 200),
    };
    const out = mazeRerouteEdges(scene);
    expect(routeHitsObstacle(out.edges[0]?.waypoints ?? [], m)).toBe(false); // rerouted around m
    expect(out.edges[1]?.waypoints).toEqual(clear.waypoints); // the clear edge is untouched
  });

  it("decollideEdgeLabels nudges a label off one it would overlap, leaving separated labels put", () => {
    const measure = (s: string): number => s.length * 8; // a deterministic stand-in metric
    const labelled = (id: string, lx: number, ly: number) => ({
      ...edge(id, "a", "a"),
      label: "RPC",
      labelPos: point(lx, ly),
    });
    // Two labels stacked at the SAME spot must separate; a third far away stays exactly where it is.
    const scene = {
      nodes: [node("a", 0, 0)],
      edges: [labelled("e0", 100, 100), labelled("e1", 100, 102), labelled("e2", 400, 400)],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 500, 500),
    };
    const out = decollideEdgeLabels(scene, measure);
    const y = (i: number) => out.edges[i]?.labelPos?.y ?? 0;
    expect(Math.abs(y(0) - y(1))).toBeGreaterThanOrEqual(16); // pushed at least a label-height apart
    // The distant label is only nudged off its own (diagonal) line — 10px up — never decollided further.
    expect(out.edges[2]?.labelPos).toEqual(point(400, 390));
  });

  const container = (id: string, x: number, y: number, w: number, h: number, parent: string | null = null) => ({
    ...node(id, x, y),
    bounds: rect(x, y, w, h),
    shape: "container" as const,
    parent: parent === null ? null : brand<string, "SceneNodeId">(parent),
  });

  it("routes an edge AROUND a group it doesn't enter, but THROUGH one it connects into", () => {
    const a = node("a", 0, 140);
    const b = node("b", 460, 140);
    const g = container("g", 150, 90, 140, 120); // a group straddling the direct a→b line
    // a → b: neither endpoint is inside g, so g is an obstacle — the route must avoid it.
    const outside = { ...edge("e0", "a", "b"), waypoints: twoOrMore(point(40, 155), point(460, 155)) };
    const out = mazeRerouteEdges({
      nodes: [a, g, b],
      edges: [outside],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 520, 300),
    });
    expect(routeHitsObstacle(out.edges[0]?.waypoints ?? [], g)).toBe(false);

    // An edge whose endpoint sits INSIDE g may cross g's box (it has to, to reach the member).
    const inner = node("inner", 180, 130); // a leaf nested in g
    const innerNode = { ...inner, parent: brand<string, "SceneNodeId">("g") };
    const entering = {
      ...edge("e1", "a", "inner"),
      waypoints: twoOrMore(point(40, 155), point(180, 145)),
    };
    const out2 = mazeRerouteEdges({
      nodes: [a, g, innerNode],
      edges: [entering],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 520, 300),
    });
    // It reaches the inner node (endpoints preserved); g is not treated as a wall for its own member.
    const wp = out2.edges[0]?.waypoints ?? [];
    expect(wp[wp.length - 1]).toEqual(point(180, 145));
  });

  it("keeps member-entering routes out of the container title band", () => {
    const outside = node("outside", 120, 0);
    const g = { ...container("g", 0, 100, 300, 120), label: "Group title" };
    const member = { ...node("member", 110, 140), parent: brand<string, "SceneNodeId">("g") };
    const crossingHeader = {
      ...edge("e0", "outside", "member"),
      waypoints: twoOrMore(point(150, 30), point(150, 112), point(130, 140)),
    };
    const scene = {
      nodes: [outside, g, member],
      edges: [crossingHeader],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 320, 240),
    };
    expect(edgesAvoidContainerHeaders(scene)).toBe(false);
    expect(edgesAvoidContainerHeaders(mazeRerouteEdges(scene))).toBe(true);
  });

  it("uses the containing group to choose cross-boundary child ports", () => {
    const outside = node("outside", 120, 0);
    const g = { ...container("g", 0, 100, 300, 120), label: "Services" };
    const member = { ...node("member", 110, 140), parent: brand<string, "SceneNodeId">("g") };
    const scene = {
      nodes: [outside, g, member],
      edges: [edge("e0", "outside", "member")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 320, 240),
    };
    const out = spreadPorts(scene);
    const routed = out.edges[0];
    if (routed === undefined) throw new Error("missing routed edge");
    const last = routed.waypoints[routed.waypoints.length - 1];
    expect(last?.y).toBe(member.bounds.origin.y);
  });

  // Count proper crossings of axis-aligned segments across all edge pairs in a routed scene.
  const orthCross = (a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }): boolean => {
    const aH = a1.y === a2.y;
    if (aH === (b1.y === b2.y)) return false;
    const h1 = aH ? a1 : b1;
    const h2 = aH ? a2 : b2;
    const v1 = aH ? b1 : a1;
    const v2 = aH ? b2 : a2;
    return (
      v1.x > Math.min(h1.x, h2.x) && v1.x < Math.max(h1.x, h2.x) &&
      h1.y > Math.min(v1.y, v2.y) && h1.y < Math.max(v1.y, v2.y)
    );
  };
  const totalCrossings = (s: ReturnType<typeof spreadPorts>): number => {
    const segs = s.edges.map((e) => {
      const out: [{ x: number; y: number }, { x: number; y: number }][] = [];
      for (let i = 1; i < e.waypoints.length; i++) {
        const a = e.waypoints[i - 1];
        const b = e.waypoints[i];
        if (a !== undefined && b !== undefined) out.push([a, b]);
      }
      return out;
    });
    let n = 0;
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++)
        for (const [a, b] of segs[i] ?? [])
          for (const [c, d] of segs[j] ?? [])
            if (orthCross(a, b, c, d)) n++;
    return n;
  };

  const customNode = (id: string, x: number, y: number, w: number, h: number) => ({
    ...node(id, x, y),
    bounds: rect(x, y, w, h),
  });

  it("minimises edge–edge crossings: a horizontal edge re-routes clear of a vertical one it crossed", () => {
    // A→B runs horizontally at y≈115; C(top)→D(bottom) runs vertically through x≈115 — they cross.
    const scene = {
      nodes: [
        customNode("a", 20, 100, 10, 10),
        customNode("b", 180, 100, 10, 10),
        customNode("c", 100, 80, 10, 10),
        customNode("d", 100, 120, 10, 10),
      ],
      edges: [edge("ab", "a", "b"), edge("cd", "c", "d")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 280, 320),
    };
    const out = spreadPorts(scene);
    expect(totalCrossings(out)).toBe(0); // the greedy pass found mount points with no crossing
  });

  it("reduces multiple crossings and is deterministic (iterated local search)", () => {
    // One horizontal edge crossing TWO separate vertical edges → 2 crossings to clear.
    const build = () => ({
      nodes: [
        customNode("a", 20, 100, 10, 10),
        customNode("b", 280, 100, 10, 10),
        customNode("c", 100, 80, 10, 10),
        customNode("d", 100, 120, 10, 10),
        customNode("e", 200, 80, 10, 10),
        customNode("f", 200, 120, 10, 10),
      ],
      edges: [edge("ab", "a", "b"), edge("cd", "c", "d"), edge("ef", "e", "f")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 380, 320),
    });
    const out = spreadPorts(build());
    expect(totalCrossings(out)).toBeLessThan(2); // at least one crossing removed (ideally all)
    // Deterministic: the same scene routes to byte-identical waypoints every time.
    const a = spreadPorts(build());
    const b = spreadPorts(build());
    expect(a.edges.map((e) => e.waypoints)).toEqual(b.edges.map((e) => e.waypoints));
  });

  // Count parallel OVERLAPS (collinear coincident segments) across all edge pairs — edges stacked on top
  // of each other, the dominant fault on dense architecture diagrams.
  const overlaps = (s: ReturnType<typeof spreadPorts>): number => {
    const par = (a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }): boolean => {
      const aH = a1.y === a2.y;
      if (aH !== (b1.y === b2.y)) return false;
      if (aH) {
        if (Math.abs(a1.y - b1.y) > 1) return false;
        return Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x)) - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x)) > 2;
      }
      if (Math.abs(a1.x - b1.x) > 1) return false;
      return Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y)) - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y)) > 2;
    };
    const segOf = (e: (typeof s.edges)[number]) => {
      const o: [{ x: number; y: number }, { x: number; y: number }][] = [];
      for (let i = 1; i < e.waypoints.length; i++) {
        const a = e.waypoints[i - 1];
        const b = e.waypoints[i];
        if (a !== undefined && b !== undefined) o.push([a, b]);
      }
      return o;
    };
    const S = s.edges.map(segOf);
    let n = 0;
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++)
      for (const [a, b] of S[i] ?? []) for (const [c, d] of S[j] ?? []) if (par(a, b, c, d)) n++;
    return n;
  };

  it("separates edges that would stack on top of each other (parallel-overlap de-collision)", () => {
    // A and B both connect to D — their cross-channel legs land on the same column and would overlap.
    const scene = {
      nodes: [node("a", 0, 0), node("b", 0, 150), node("d", 400, 70)],
      edges: [edge("ad", "a", "d"), edge("bd", "b", "d")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 460, 220),
    };
    const out = spreadPorts(scene);
    expect(overlaps(out)).toBe(0); // the two routes were pulled onto separate tracks
  });

  it("respreadPorts re-routes a hand-arranged scene with full spreading, not naive stacked Z-routes", () => {
    // A hub whose four connectors all leave the same side — the post-drag case. The cheap re-router
    // (`retidyRoutes`) snaps each to a box-centre Z, stacking their stubs; the full re-router spreads
    // them onto distinct ports. This is the fix for a hand-arranged diagram looking tangled.
    const scene = {
      nodes: [
        node("h", 100, 200),
        node("a", 500, 40),
        node("b", 500, 140),
        node("c", 500, 240),
        node("d", 500, 340),
      ],
      edges: [edge("ah", "a", "h"), edge("bh", "b", "h"), edge("ch", "c", "h"), edge("dh", "d", "h")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 620, 420),
    };
    expect(overlaps(retidyRoutes(scene))).toBeGreaterThan(0); // naive: the four stubs stack
    const full = respreadPorts(scene);
    expect(overlaps(full)).toBeLessThan(overlaps(retidyRoutes(scene)));
    const approachTracks = new Set(
      full.edges.map((e) => {
        const p = e.waypoints[e.waypoints.length - 2];
        return p === undefined ? "" : `${p.x}:${p.y}`;
      }),
    );
    expect(approachTracks.size).toBeGreaterThan(1);
    // Trunk mode does the OPPOSITE on purpose: the fan is merged onto one shared backbone (the bus look),
    // so the four routes deliberately share collinear segments (which the renderer marks with junctions).
    expect(overlaps(trunkRoutes(scene))).toBeGreaterThan(0);
  });

  it("reserves channel width by edge density: a busy channel pushes the far band apart", () => {
    // Three top-row nodes all feed one bottom node through a narrow gap → the channel must widen.
    const scene = {
      nodes: [node("a", 0, 0), node("b", 60, 0), node("c", 120, 0), node("d", 60, 40)],
      edges: [edge("ad", "a", "d"), edge("bd", "b", "d"), edge("cd", "c", "d")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 200, 80),
    };
    const out = spreadPorts(scene);
    const dy = out.nodes.find((n) => n.id === "d")?.bounds.origin.y ?? 0;
    expect(dy).toBeGreaterThan(40); // the bottom band was shifted down to open the channel

    // A single-edge channel is roomy enough already → no shift (sparse diagrams don't grow).
    const sparse = {
      nodes: [node("a", 0, 0), node("d", 0, 80)],
      edges: [edge("ad", "a", "d")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 60, 120),
    };
    const sout = spreadPorts(sparse);
    expect(sout.nodes.find((n) => n.id === "d")?.bounds.origin.y).toBe(80);
  });

  it("leaves a self-loop / dangling edge untouched", () => {
    const scene = {
      nodes: [node("a", 0, 0)],
      edges: [edge("self", "a", "a"), edge("dangling", "a", "ghost")],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 40, 30),
    };
    const out = spreadPorts(scene);
    expect(out.edges[0]?.waypoints).toEqual(scene.edges[0]?.waypoints);
    expect(out.edges[1]?.waypoints).toEqual(scene.edges[1]?.waypoints);
  });
});

describe("snapSceneEdgesToMountPoints", () => {
  const node = (id: string, x: number, y: number, shape: "rect" | "diamond" = "rect") => ({
    id: brand<string, "SceneNodeId">(id),
    bounds: rect(x, y, 80, 60),
    label: id,
    shape,
    parent: null,
    icon: null,
    rows: null,
    rowDivider: null,
    subtitle: null,
    accent: "none" as const,
    role: "normal" as const,
  });
  const edge = {
    id: brand<string, "SceneEdgeId">("e0"),
    from: brand<string, "SceneNodeId">("a"),
    to: brand<string, "SceneNodeId">("b"),
    waypoints: twoOrMore(point(80, 5), point(140, 5), point(140, 155), point(200, 155)),
    label: "RPC",
    stroke: "solid" as const,
    fromEnd: "none" as const,
    toEnd: "arrow" as const,
    curved: false,
    fromLabel: null,
    toLabel: null,
    labelPos: point(140, 80),
  };

  it("moves corner-ish endpoints to the side-center mount points", () => {
    const out = snapSceneEdgesToMountPoints({
      nodes: [node("a", 0, 0), node("b", 200, 120)],
      edges: [edge],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 280, 180),
    });
    expect(out.edges[0]?.waypoints[0]).toEqual(point(80, 30));
    expect(out.edges[0]?.waypoints[1]).toEqual(point(140, 30));
    expect(out.edges[0]?.waypoints[out.edges[0].waypoints.length - 2]).toEqual(point(140, 150));
    expect(out.edges[0]?.waypoints[out.edges[0].waypoints.length - 1]).toEqual(point(200, 150));
  });

  it("moves diamond endpoints to the top, bottom, left, or right vertices", () => {
    const out = snapSceneEdgesToMountPoints({
      nodes: [node("a", 0, 0, "diamond"), node("b", 200, 120, "diamond")],
      edges: [
        {
          ...edge,
          waypoints: twoOrMore(point(75, 12), point(140, 12), point(140, 162), point(205, 162)),
        },
      ],
      wedges: [],
      decorations: [],
      extent: rect(0, 0, 280, 180),
    });
    const first = out.edges[0]?.waypoints[0];
    const last = out.edges[0]?.waypoints[out.edges[0].waypoints.length - 1];
    expect([point(80, 30), point(0, 30), point(40, 60), point(40, 0)]).toContainEqual(first);
    expect([point(280, 150), point(200, 150), point(240, 180), point(240, 120)]).toContainEqual(
      last,
    );
  });
});
