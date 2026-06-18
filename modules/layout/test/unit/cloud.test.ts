import { brand } from "@m/std";
import type { CloudAst, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutCloud } from "../../src/core/cloud.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

const ast: CloudAst = {
  kind: "cloud",
  groups: [{ id: nid("g0"), label: "AWS", parent: null }],
  nodes: [
    { id: nid("web"), label: "Web", kind: "compute", parent: nid("g0"), icon: null },
    { id: nid("db"), label: "DB", kind: "database", parent: null, icon: null },
  ],
  links: [{ id: eid("l0"), from: nid("web"), to: nid("db"), label: null }],
};

describe("layoutCloud", () => {
  const result = layoutCloud(ast, heuristicMeasure);
  if (!result.ok) throw new Error(result.error.message);
  const scene = result.value;
  const byId = new Map<string, SceneNode>(scene.nodes.map((n) => [n.id, n]));

  it("fails loudly when a node's parent group is missing", () => {
    const bad: CloudAst = {
      kind: "cloud",
      groups: [],
      nodes: [{ id: nid("web"), label: "Web", kind: "compute", parent: nid("ghost"), icon: null }],
      links: [],
    };
    expect(layoutCloud(bad, heuristicMeasure).ok).toBe(false);
  });

  it("fails loudly when a link references an unknown node", () => {
    const bad: CloudAst = {
      kind: "cloud",
      groups: [],
      nodes: [{ id: nid("web"), label: "Web", kind: "compute", parent: null, icon: null }],
      links: [{ id: eid("l0"), from: nid("web"), to: nid("ghost"), label: null }],
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

  it("connects links undirected (no arrowhead)", () => {
    expect(scene.edges).toHaveLength(1);
    expect(scene.edges[0]?.toEnd).toBe("none");
  });
});
