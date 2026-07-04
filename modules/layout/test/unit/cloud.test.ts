import { brand } from "@m/std";
import type { CloudAst, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutCloud } from "../../src/core/cloud.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

const ast: CloudAst = {
  kind: "cloud",
  styles: [],
  groups: [{ id: nid("g0"), label: "AWS", parent: null }],
  nodes: [
    { id: nid("web"), label: "Web", kind: "compute", parent: nid("g0"), icon: null },
    { id: nid("db"), label: "DB", kind: "database", parent: null, icon: null },
  ],
  links: [{ id: eid("l0"), from: nid("web"), to: nid("db"), label: null, directed: false }],
};

describe("layoutCloud", () => {
  const result = layoutCloud(ast, heuristicMeasure);
  if (!result.ok) throw new Error(result.error.message);
  const scene = result.value;
  const byId = new Map<string, SceneNode>(scene.nodes.map((n) => [n.id, n]));

  it("fails loudly when a node's parent group is missing", () => {
    const bad: CloudAst = {
      kind: "cloud",
      styles: [],
      groups: [],
      nodes: [{ id: nid("web"), label: "Web", kind: "compute", parent: nid("ghost"), icon: null }],
      links: [],
    };
    expect(layoutCloud(bad, heuristicMeasure).ok).toBe(false);
  });

  it("fails loud (no stack overflow) on group nesting deeper than the cap", () => {
    // A linear chain deeper than MAX_NEST_DEPTH (which a cyclic parent would also produce) must hit the
    // depth cap and return an error rather than blow the stack in the `childrenOf`-keyed recursion.
    const deep = 70;
    const groups = Array.from({ length: deep }, (_, i) => ({
      id: nid(`g${i}`),
      label: `g${i}`,
      parent: i === 0 ? null : nid(`g${i - 1}`),
    }));
    const bad: CloudAst = {
      kind: "cloud",
      styles: [],
      groups,
      nodes: [
        { id: nid("leaf"), label: "Leaf", kind: "compute", parent: nid(`g${deep - 1}`), icon: null },
      ],
      links: [],
    };
    expect(layoutCloud(bad, heuristicMeasure).ok).toBe(false);
  });

  it("fails loudly when a link references an unknown node", () => {
    const bad: CloudAst = {
      kind: "cloud",
      styles: [],
      groups: [],
      nodes: [{ id: nid("web"), label: "Web", kind: "compute", parent: null, icon: null }],
      links: [{ id: eid("l0"), from: nid("web"), to: nid("ghost"), label: null, directed: false }],
    };
    expect(layoutCloud(bad, heuristicMeasure).ok).toBe(false);
  });

  it("renders groups as containers and nests their children fully inside", () => {
    const g0 = byId.get("g0");
    const web = byId.get("web");
    expect(g0?.shape).toBe("container");
    if (g0 === undefined || web === undefined) throw new Error("missing nodes");
    const g = g0.bounds;
    const w = web.bounds;
    expect(w.origin.x).toBeGreaterThanOrEqual(g.origin.x);
    expect(w.origin.y).toBeGreaterThanOrEqual(g.origin.y);
    expect(w.origin.x + w.size.width).toBeLessThanOrEqual(g.origin.x + g.size.width);
    expect(w.origin.y + w.size.height).toBeLessThanOrEqual(g.origin.y + g.size.height);
  });

  it("maps each service leaf's kind to a vendored simple-icons glyph; groups have none", () => {
    expect(byId.get("web")?.icon).toEqual({ pack: "simpleicons", name: "docker" });
    expect(byId.get("db")?.icon).toEqual({ pack: "simpleicons", name: "postgresql" });
    expect(byId.get("g0")?.icon).toBeNull();
  });

  it("assigns semantic accents so cloud diagrams keep architecture colours", () => {
    expect(byId.get("web")?.accent).toBe("compute");
    expect(byId.get("db")?.accent).toBe("data");
    expect(byId.get("g0")?.accent).toBe("muted");
  });

  it("connects links undirected (no arrowhead)", () => {
    expect(scene.edges).toHaveLength(1);
    expect(scene.edges[0]?.toEnd).toBe("none");
  });

  it("draws a directed traffic edge with an arrowhead at the target", () => {
    const directed: CloudAst = {
      kind: "cloud",
      styles: [],
      groups: [],
      nodes: [
        { id: nid("web"), label: "Web", kind: "compute", parent: null, icon: null },
        { id: nid("db"), label: "DB", kind: "database", parent: null, icon: null },
      ],
      links: [{ id: eid("l0"), from: nid("web"), to: nid("db"), label: "writes", directed: true }],
    };
    const r = layoutCloud(directed, heuristicMeasure);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.edges[0]?.toEnd).toBe("arrow");
    expect(r.value.edges[0]?.fromEnd).toBe("none");
  });
});

describe("layoutCloud — collapse", () => {
  it("hides a collapsed group's members and re-attaches its links to the container", () => {
    const r = layoutCloud(ast, heuristicMeasure, new Set([nid("g0")]));
    if (!r.ok) throw new Error(r.error.message);
    const ids = r.value.nodes.map((n) => n.id);
    expect(ids).toContain("g0"); // the container header stays
    expect(ids).toContain("db");
    expect(ids).not.toContain("web"); // a member of the collapsed group is hidden
    // The web—db link now runs g0—db (re-attached to the collapsed container).
    expect(r.value.edges).toHaveLength(1);
    expect([r.value.edges[0]?.from, r.value.edges[0]?.to].sort()).toEqual(["db", "g0"]);
  });

  it("drops a link whose both ends collapse into the same group", () => {
    const twoInOne: CloudAst = {
      kind: "cloud",
      styles: [],
      groups: [{ id: nid("g0"), label: "AWS", parent: null }],
      nodes: [
        { id: nid("a"), label: "A", kind: "compute", parent: nid("g0"), icon: null },
        { id: nid("b"), label: "B", kind: "storage", parent: nid("g0"), icon: null },
      ],
      links: [{ id: eid("l0"), from: nid("a"), to: nid("b"), label: null, directed: false }],
    };
    const r = layoutCloud(twoInOne, heuristicMeasure, new Set([nid("g0")]));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.edges).toHaveLength(0); // a—b would self-loop on g0, so it's dropped
    expect(r.value.nodes.map((n) => n.id)).toEqual(["g0"]);
  });
});
