import { brand } from "@m/std";
import { describe, expect, it } from "vitest";
import type { HitTarget } from "../../src/core/hit.js";
import { emptySelection, isSelected, selectOnly, toggle } from "../../src/core/selection.js";

const nodeT = (s: string): HitTarget => ({ kind: "node", id: brand<string, "SceneNodeId">(s) });
const edgeT = (s: string): HitTarget => ({ kind: "edge", id: brand<string, "SceneEdgeId">(s) });

describe("selection", () => {
  it("selectOnly replaces the selection with a single target", () => {
    const s = selectOnly(nodeT("A"));
    expect([...s.nodes]).toEqual(["A"]);
    expect(isSelected(s, nodeT("A"))).toBe(true);
    expect(isSelected(s, nodeT("B"))).toBe(false);
  });

  it("selectOnly(null) clears", () => {
    expect(selectOnly(null)).toBe(emptySelection);
  });

  it("toggle adds then removes the same target", () => {
    const added = toggle(emptySelection, nodeT("A"));
    expect(isSelected(added, nodeT("A"))).toBe(true);
    const removed = toggle(added, nodeT("A"));
    expect(isSelected(removed, nodeT("A"))).toBe(false);
  });

  it("toggle keeps targets of the other kind", () => {
    const s = toggle(selectOnly(nodeT("A")), edgeT("e0"));
    expect(isSelected(s, nodeT("A"))).toBe(true);
    expect(isSelected(s, edgeT("e0"))).toBe(true);
  });
});
