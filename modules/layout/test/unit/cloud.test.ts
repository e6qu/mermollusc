import { brand } from "@m/std";
import type { CloudAst, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { layoutCloud } from "../../src/core/cloud.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

const ast: CloudAst = {
  kind: "cloud",
  groups: [{ id: nid("g0"), label: "AWS", parent: null }],
  nodes: [
    { id: nid("web"), label: "Web", kind: "compute", parent: nid("g0") },
    { id: nid("db"), label: "DB", kind: "database", parent: null },
  ],
  links: [{ id: eid("l0"), from: nid("web"), to: nid("db"), label: null }],
};

describe("layoutCloud", () => {
  const scene = layoutCloud(ast);
  const byId = new Map<string, SceneNode>(scene.nodes.map((n) => [n.id, n]));

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

  it("gives each service leaf a kind icon and groups none", () => {
    expect(byId.get("web")?.icon).toEqual({ pack: "arch", name: "compute" });
    expect(byId.get("db")?.icon).toEqual({ pack: "arch", name: "database" });
    expect(byId.get("g0")?.icon).toBeNull();
  });

  it("connects links undirected (no arrowhead)", () => {
    expect(scene.edges).toHaveLength(1);
    expect(scene.edges[0]?.arrow).toBe("none");
  });
});
