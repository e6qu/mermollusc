import { brand } from "@m/std";
import type { BlockAst, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { layoutBlock } from "../../src/core/block.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

const ast: BlockAst = {
  kind: "block",
  columns: 2,
  blocks: [
    { id: nid("a"), label: "A", shape: "rect", icon: null },
    { id: nid("b"), label: "B", shape: "rect", icon: null },
    { id: nid("c"), label: "C", shape: "rect", icon: null },
  ],
  edges: [{ id: eid("e0"), from: nid("a"), to: nid("b"), kind: "arrow", label: null }],
};

describe("layoutBlock", () => {
  const scene = layoutBlock(ast);
  const byId = new Map<string, SceneNode>(scene.nodes.map((n) => [n.id, n]));

  it("lays blocks out row-major across the given column count", () => {
    const a = byId.get("a")?.bounds;
    const b = byId.get("b")?.bounds;
    const c = byId.get("c")?.bounds;
    if (a === undefined || b === undefined || c === undefined) throw new Error("missing nodes");
    // a and b share a row; b is to the right of a.
    expect(a.origin.y).toBe(b.origin.y);
    expect(b.origin.x).toBeGreaterThan(a.origin.x);
    // c wraps to the next row, back at the first column.
    expect(c.origin.x).toBe(a.origin.x);
    expect(c.origin.y).toBeGreaterThan(a.origin.y);
  });

  it("connects edges centre-to-centre between the two blocks", () => {
    expect(scene.edges).toHaveLength(1);
    const edge = scene.edges[0];
    const a = byId.get("a")?.bounds;
    const b = byId.get("b")?.bounds;
    if (edge === undefined || a === undefined || b === undefined) throw new Error("missing");
    expect(edge.waypoints[0]).toEqual({ x: a.origin.x + a.size.width / 2, y: a.origin.y + 20 });
    expect(edge.waypoints[1]).toEqual({ x: b.origin.x + b.size.width / 2, y: b.origin.y + 20 });
  });

  it("sizes the extent to the populated grid", () => {
    expect(scene.extent.size.width).toBeGreaterThan(0);
    expect(scene.extent.size.height).toBeGreaterThan(0);
  });

  it("honours an injected text measurer for node sizing", () => {
    const wide = layoutBlock(ast, (label) => label.length * 60);
    const a = wide.nodes.find((n) => n.id === "a")?.bounds.size.width;
    // 1-char label: heuristic cell = max(48, 8+24)=48; measured = max(48, 60+24)=84.
    expect(a).toBe(84);
    expect(scene.nodes.find((n) => n.id === "a")?.bounds.size.width).toBe(48);
  });
});
