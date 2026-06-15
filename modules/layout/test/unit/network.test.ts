import { brand } from "@m/std";
import type { NetworkAst, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { layoutNetwork } from "../../src/core/network.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

const ast: NetworkAst = {
  kind: "network",
  nodes: [
    { id: nid("a"), label: "A", kind: "server" },
    { id: nid("b"), label: "B", kind: "database" },
    { id: nid("c"), label: "C", kind: "cloud" },
  ],
  links: [{ id: eid("l0"), from: nid("a"), to: nid("b"), label: null }],
};

describe("layoutNetwork", () => {
  const scene = layoutNetwork(ast);
  const byId = new Map<string, SceneNode>(scene.nodes.map((n) => [n.id, n]));

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
    expect(scene.edges[0]?.arrow).toBe("none");
    expect(scene.edges[0]?.stroke).toBe("solid");
  });
});
