import { brand } from "@m/std";
import type { C4Ast, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { layoutC4 } from "../../src/core/c4.js";

const cid = (s: string) => brand<string, "C4ElementId">(s);
const rid = (s: string) => brand<string, "C4RelId">(s);

const ast: C4Ast = {
  kind: "c4",
  elements: [
    { id: cid("alice"), label: "Alice", kind: "person", parent: null },
    { id: cid("backend"), label: "Backend", kind: "boundary", parent: null },
    { id: cid("api"), label: "API", kind: "container", parent: cid("backend") },
    { id: cid("db"), label: "DB", kind: "container", parent: cid("backend") },
  ],
  rels: [{ id: rid("r0"), from: cid("alice"), to: cid("api"), label: "uses" }],
};

describe("layoutC4", () => {
  const scene = layoutC4(ast);
  const byId = new Map<string, SceneNode>(scene.nodes.map((n) => [n.id, n]));

  it("nests children fully inside the boundary box", () => {
    const backend = byId.get("backend");
    const api = byId.get("api");
    expect(backend?.shape).toBe("container");
    if (backend === undefined || api === undefined) throw new Error("missing nodes");
    const b = backend.bounds;
    const a = api.bounds;
    expect(a.origin.x).toBeGreaterThanOrEqual(b.origin.x);
    expect(a.origin.y).toBeGreaterThanOrEqual(b.origin.y);
    expect(a.origin.x + a.size.width).toBeLessThanOrEqual(b.origin.x + b.size.width);
    expect(a.origin.y + a.size.height).toBeLessThanOrEqual(b.origin.y + b.size.height);
  });

  it("places leaf elements (person) outside the boundary", () => {
    expect(byId.get("alice")?.shape).toBe("round");
    expect(byId.get("alice")?.parent).toBeNull();
  });

  it("emits a straight edge per relation", () => {
    expect(scene.edges.map((e) => e.id)).toEqual(["r0"]);
    expect(scene.edges[0]?.waypoints).toHaveLength(2);
  });
});
