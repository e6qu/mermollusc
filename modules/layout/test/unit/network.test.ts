import { brand } from "@m/std";
import type { NetworkAst, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutNetwork } from "../../src/core/network.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

const ast: NetworkAst = {
  kind: "network",
  nodes: [
    { id: nid("a"), label: "A", kind: "server", icon: null, parent: null },
    { id: nid("b"), label: "B", kind: "database", icon: null, parent: null },
    { id: nid("c"), label: "C", kind: "cloud", icon: null, parent: null },
  ],
  groups: [],
  links: [{ id: eid("l0"), from: nid("a"), to: nid("b"), label: null }],
};

describe("layoutNetwork", () => {
  const result = layoutNetwork(ast, heuristicMeasure);
  if (!result.ok) throw new Error(result.error.message);
  const scene = result.value;
  const byId = new Map<string, SceneNode>(scene.nodes.map((n) => [n.id, n]));

  it("fails loudly when a link references an unknown node", () => {
    const bad: NetworkAst = {
      kind: "network",
      nodes: [{ id: nid("a"), label: "A", kind: "server", icon: null, parent: null }],
      groups: [],
      links: [{ id: eid("l0"), from: nid("a"), to: nid("ghost"), label: null }],
    };
    expect(layoutNetwork(bad, heuristicMeasure).ok).toBe(false);
  });

  it("places nodes in a squarish grid (3 nodes → 2 columns)", () => {
    const a = byId.get("a")?.bounds;
    const b = byId.get("b")?.bounds;
    const c = byId.get("c")?.bounds;
    if (a === undefined || b === undefined || c === undefined) throw new Error("missing nodes");
    // a, b share the first row; c wraps to the next row at the first column.
    expect(a.origin.y).toBe(b.origin.y);
    expect(b.origin.x).toBeGreaterThan(a.origin.x);
    expect(c.origin.x).toBe(a.origin.x);
    expect(c.origin.y).toBeGreaterThan(a.origin.y);
  });

  it("renders links undirected (no arrowhead)", () => {
    expect(scene.edges).toHaveLength(1);
    expect(scene.edges[0]?.toEnd).toBe("none");
    expect(scene.edges[0]?.stroke).toBe("solid");
  });
});

describe("layoutNetwork — subnet/zone groups", () => {
  it("nests members inside their group container and caps a cyclic parent", () => {
    const grouped: NetworkAst = {
      kind: "network",
      nodes: [
        { id: nid("web"), label: "Web", kind: "server", icon: null, parent: nid("group:0") },
        { id: nid("db"), label: "DB", kind: "database", icon: null, parent: null },
      ],
      groups: [{ id: nid("group:0"), label: "DMZ", parent: null }],
      links: [],
    };
    const r = layoutNetwork(grouped, heuristicMeasure);
    if (!r.ok) throw new Error(r.error.message);
    const by = new Map<string, SceneNode>(r.value.nodes.map((n) => [n.id, n]));
    expect(by.get("group:0")?.shape).toBe("container");
    const g = by.get("group:0")?.bounds;
    const web = by.get("web")?.bounds;
    if (g !== undefined && web !== undefined) {
      expect(web.origin.x).toBeGreaterThanOrEqual(g.origin.x);
      expect(web.origin.y).toBeGreaterThanOrEqual(g.origin.y);
    }
  });
});
