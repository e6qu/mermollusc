import fc from "fast-check";
import { brand } from "@m/std";
import type { BlockAst, NetworkAst, NetworkNodeKind, Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { layoutBlock } from "../../src/core/block.js";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutNetwork } from "../../src/core/network.js";

const nid = (s: string) => brand<string, "NodeId">(s);

const ident = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"), { minLength: 1, maxLength: 6 })
  .map((cs) => cs.join(""));

const kind: fc.Arbitrary<NetworkNodeKind> = fc.constantFrom(
  "server",
  "database",
  "cloud",
  "router",
  "switch",
  "firewall",
  "host",
);

const withinExtent = (scene: Scene): void => {
  for (const n of scene.nodes) {
    const { origin, size } = n.bounds;
    expect(origin.x).toBeGreaterThanOrEqual(0);
    expect(origin.y).toBeGreaterThanOrEqual(0);
    expect(origin.x + size.width).toBeLessThanOrEqual(scene.extent.size.width + 1e-9);
    expect(origin.y + size.height).toBeLessThanOrEqual(scene.extent.size.height + 1e-9);
  }
};

describe("layoutBlock — grid invariants (property-based)", () => {
  it("preserves node identity/count and fits every box inside the extent", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(ident, { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 1, max: 5 }),
        (ids, columns) => {
          const ast: BlockAst = {
            kind: "block",
            columns,
            blocks: ids.map((id) => ({ id: nid(id), label: id, shape: "rect", icon: null })),
            edges: [],
          };
          const result = layoutBlock(ast, heuristicMeasure);
          if (!result.ok) throw new Error(result.error.message);
          const scene = result.value;
          expect(scene.nodes.map((n) => n.id)).toEqual(ids);
          withinExtent(scene);
        },
      ),
    );
  });
});

describe("layoutNetwork — grid invariants (property-based)", () => {
  it("preserves node identity/count, sets an icon ref, and fits every box inside the extent", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(ident, { minLength: 1, maxLength: 8 }),
        fc.array(kind, { minLength: 8, maxLength: 8 }),
        (ids, kinds) => {
          const ast: NetworkAst = {
            kind: "network",
            nodes: ids.map((id, i) => ({ id: nid(id), label: id, kind: kinds[i] ?? "host", icon: null })),
            links: [],
          };
          const result = layoutNetwork(ast, heuristicMeasure);
          if (!result.ok) throw new Error(result.error.message);
          const scene = result.value;
          expect(scene.nodes.map((n) => n.id)).toEqual(ids);
          for (const n of scene.nodes) expect(n.icon).not.toBeNull();
          withinExtent(scene);
        },
      ),
    );
  });
});
