import { brand } from "@m/std";
import type { C4Ast, SceneNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutC4 } from "../../src/core/c4.js";

const cid = (s: string) => brand<string, "C4ElementId">(s);
const rid = (s: string) => brand<string, "C4RelId">(s);

const ast: C4Ast = {
  kind: "c4",
  elements: [
    { id: cid("alice"), label: "Alice", description: "A customer", kind: "person", parent: null },
    { id: cid("backend"), label: "Backend", description: null, kind: "boundary", parent: null },
    { id: cid("api"), label: "API", description: null, kind: "container", parent: cid("backend") },
    { id: cid("db"), label: "DB", description: null, kind: "container", parent: cid("backend") },
  ],
  rels: [{ id: rid("r0"), from: cid("alice"), to: cid("api"), label: "uses" }],
};

describe("layoutC4", () => {
  const result = layoutC4(ast, heuristicMeasure);
  if (!result.ok) throw new Error(result.error.message);
  const scene = result.value;
  const byId = new Map<string, SceneNode>(scene.nodes.map((n) => [n.id, n]));

  it("fails loudly when an element's parent is dangling", () => {
    const bad: C4Ast = {
      kind: "c4",
      elements: [
        { id: cid("api"), label: "API", description: null, kind: "container", parent: cid("missing") },
      ],
      rels: [],
    };
    expect(layoutC4(bad, heuristicMeasure).ok).toBe(false);
  });

  it("fails loudly when a relation references an unknown element", () => {
    const bad: C4Ast = {
      kind: "c4",
      elements: [{ id: cid("alice"), label: "Alice", description: null, kind: "person", parent: null }],
      rels: [{ id: rid("r0"), from: cid("alice"), to: cid("ghost"), label: "uses" }],
    };
    expect(layoutC4(bad, heuristicMeasure).ok).toBe(false);
  });

  it("fails loud (no stack overflow) on a duplicate id nested in its twin", () => {
    // Two boundaries sharing an id, one parented to the other — `place`'s id-keyed recursion would
    // re-enter the same children bucket forever without the duplicate-id reject.
    const dup: C4Ast = {
      kind: "c4",
      elements: [
        { id: cid("shop"), label: "Shop", description: null, kind: "boundary", parent: null },
        { id: cid("shop"), label: "Shop", description: null, kind: "boundary", parent: cid("shop") },
      ],
      rels: [],
    };
    expect(layoutC4(dup, heuristicMeasure).ok).toBe(false);
  });

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

  it("emits a right-angle (port-spread) edge per relation", () => {
    expect(scene.edges.map((e) => e.id)).toEqual(["r0"]);
    // `spreadPorts` routes each relation as a 4-point orthogonal path into per-side lanes.
    expect(scene.edges[0]?.waypoints).toHaveLength(4);
  });

  it("renders a description as a second label line and widens the box to fit it", () => {
    const alice = byId.get("alice");
    if (alice === undefined) throw new Error("missing alice");
    expect(alice.label).toBe("Alice\nA customer");
    // "A customer" is wider than both "Alice" and the MIN_LEAF_WIDTH (80) floor, so the box grew.
    expect(alice.bounds.size.width).toBeGreaterThan(80);
  });
});
