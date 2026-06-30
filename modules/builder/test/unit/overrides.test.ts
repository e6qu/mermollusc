import { brand, point, rect } from "@m/std";
import type { LayoutOverrides, Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { applyOverrides, clearOverride, moveNode, resizeNode } from "../../src/core/overrides.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const scene: Scene = {
  nodes: [
    { id: snid("A"), bounds: rect(0, 0, 60, 40), label: "A", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
    { id: snid("B"), bounds: rect(0, 100, 60, 40), label: "B", shape: "rect", parent: null, icon: null, rowDivider: null, subtitle: null, accent: "none",
      role: "normal", rows: null },
  ],
  edges: [
    {
      id: seid("e0"),
      from: snid("A"),
      to: snid("B"),
      waypoints: [point(30, 40), point(30, 100)],
      label: null,
      stroke: "solid",
      fromEnd: "none",
      toEnd: "arrow",
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos: null,
    },
  ],
  wedges: [],
  decorations: [], extent: rect(0, 0, 60, 140),
};

describe("overrides", () => {
  it("moveNode records a pinned position override", () => {
    const o = moveNode(new Map(), snid("A"), point(200, 50));
    const a = o.get(snid("A"));
    expect(a?.position).toEqual(point(200, 50));
    expect(a?.pinned).toBe(true);
  });

  it("resizeNode records a pinned position + size, and applyOverrides resizes the node", () => {
    const sz = rect(0, 0, 120, 80).size;
    const o = resizeNode(new Map(), snid("A"), point(10, 20), sz);
    const a = o.get(snid("A"));
    expect(a?.position).toEqual(point(10, 20));
    expect(a?.size).toEqual(sz);
    expect(a?.pinned).toBe(true);
    const shown = applyOverrides(scene, o);
    expect(shown.nodes[0]?.bounds.size).toEqual(sz);
  });

  it("applyOverrides repositions only the overridden node", () => {
    const o: LayoutOverrides = moveNode(new Map(), snid("A"), point(200, 50));
    const moved = applyOverrides(scene, o);
    expect(moved.nodes[0]?.bounds.origin).toEqual(point(200, 50));
    expect(moved.nodes[1]?.bounds.origin).toEqual(point(0, 100));
  });

  it("applyOverrides with no overrides returns the same scene", () => {
    expect(applyOverrides(scene, new Map())).toBe(scene);
  });

  it("extends the extent origin (not just size) when a node is dragged past the top-left", () => {
    // Move A to negative coordinates; the extent must include them so the host can't clip it.
    const moved = applyOverrides(scene, moveNode(new Map(), snid("A"), point(-40, -30)));
    expect(moved.extent.origin).toEqual(point(-40, -30));
    // Width/height span from the new min corner to the far corner of the unmoved node B.
    expect(moved.extent.size.width).toBe(60 - -40); // B right edge (60) − minX (−40)
    expect(moved.extent.size.height).toBe(140 - -30); // original extent bottom (140) − minY (−30)
  });

  it("follows a boundary edge's moved endpoint, keeping its shape (no straight-line collapse)", () => {
    // Move only A by (+200,+50). The A end (t=0) translates by A's full delta — staying at A's relative
    // attachment (its bottom-centre, now on A's new border); the B end (t=1) is unchanged.
    const moved = applyOverrides(scene, moveNode(new Map(), snid("A"), point(200, 50)));
    expect(moved.edges[0]?.waypoints).toEqual([point(230, 90), point(30, 100)]);
  });

  it("snaps moved box-family connectors to side-center mounts when requested", () => {
    const moved = applyOverrides(scene, moveNode(new Map(), snid("A"), point(200, 50)), true);
    expect(moved.edges[0]?.waypoints).toEqual([point(200, 70), point(60, 120)]);
  });

  it("translates an edge whose endpoints both move by the same delta (group move)", () => {
    let o: LayoutOverrides = moveNode(new Map(), snid("A"), point(100, 10));
    o = moveNode(o, snid("B"), point(100, 110)); // both shifted by (+100, +10)
    const moved = applyOverrides(scene, o);
    // The route is preserved, just translated — not re-anchored to borders.
    expect(moved.edges[0]?.waypoints).toEqual([point(130, 50), point(130, 110)]);
  });

  it("clearOverride removes a node's override", () => {
    const o = moveNode(new Map(), snid("A"), point(200, 50));
    expect(clearOverride(o, snid("A")).has(snid("A"))).toBe(false);
  });
});
