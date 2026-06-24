import { brand, rect } from "@m/std";
import type { NodeShape, Scene, SceneNode, SceneNodeId } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { descendantsOf } from "../../src/core/hit.js";

const nid = (s: string): SceneNodeId => brand<string, "SceneNodeId">(s);

// A bare scene node at the origin; only `id`, `parent`, `shape` matter for descendant queries.
const node = (id: string, parent: string | null, shape: NodeShape = "rect"): SceneNode => ({
  id: nid(id),
  bounds: rect(0, 0, 10, 10),
  label: id,
  shape,
  parent: parent === null ? null : nid(parent),
  icon: null,
  rows: null,
  rowDivider: null,
  subtitle: null,
  accent: "none",
  role: "normal",
});

const scene = (nodes: readonly SceneNode[]): Scene => ({
  nodes,
  edges: [],
  wedges: [],
  decorations: [],
  extent: rect(0, 0, 100, 100),
});

describe("descendantsOf", () => {
  it("returns every node transitively nested in a container, across nesting levels", () => {
    // SG ⊃ { A, inner ⊃ { B } }, plus a sibling C outside SG.
    const s = scene([
      node("SG", null, "container"),
      node("A", "SG"),
      node("inner", "SG", "container"),
      node("B", "inner"),
      node("C", null),
    ]);
    expect(new Set(descendantsOf(s, nid("SG")))).toEqual(
      new Set([nid("A"), nid("inner"), nid("B")]),
    );
    expect(descendantsOf(s, nid("inner"))).toEqual([nid("B")]);
  });

  it("returns nothing for a leaf and tolerates a cyclic parent chain", () => {
    expect(descendantsOf(scene([node("A", null)]), nid("A"))).toEqual([]);
    // A ↔ B cycle must not loop forever; neither is a descendant of a separate container.
    const cyclic = scene([node("A", "B"), node("B", "A"), node("X", null, "container")]);
    expect(descendantsOf(cyclic, nid("X"))).toEqual([]);
  });
});
