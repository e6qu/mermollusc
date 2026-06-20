import { brand, point, size } from "@m/std";
import type { GroupMember, Groups, LayoutOverrides, SceneNodeId } from "@m/contracts";
import { describe, expect, it, vi } from "vitest";
import { createCollabSession } from "../../src/index.js";

const n = (s: string): SceneNodeId => brand<string, "SceneNodeId">(s);
const node = (s: string): GroupMember => ({ kind: "node", id: n(s) });

const newSession = (over: {
  overrides?: LayoutOverrides;
  groups?: Groups;
  source?: string;
  save?: (s: string) => void;
}) =>
  createCollabSession({
    initialOverrides: over.overrides ?? new Map(),
    initialGroups: over.groups ?? new Map(),
    initialSource: over.source ?? "",
    save: over.save ?? (() => {}),
  });

describe("collab session — overlay (single client)", () => {
  it("seeds the initial overrides and source", () => {
    const s = newSession({
      overrides: new Map([[n("a"), { position: point(10, 20), size: null, pinned: true }]]),
      source: "flowchart TD\n  A --> B\n",
    });
    expect(s.overlay.overrides().get(n("a"))?.position).toEqual(point(10, 20));
    expect(s.source()).toBe("flowchart TD\n  A --> B\n");
    s.destroy();
  });

  it("moveNode pins a node at the new position", () => {
    const s = newSession({});
    s.overlay.moveNode(n("a"), point(5, 6));
    const o = s.overlay.overrides().get(n("a"));
    expect(o).toEqual({ position: point(5, 6), size: null, pinned: true });
    s.destroy();
  });

  it("resizeNode records position and size", () => {
    const s = newSession({});
    s.overlay.resizeNode(n("a"), point(1, 2), size(30, 40));
    expect(s.overlay.overrides().get(n("a"))).toEqual({
      position: point(1, 2),
      size: size(30, 40),
      pinned: true,
    });
    s.destroy();
  });

  it("groups, labels, locks, and ungroups", () => {
    const s = newSession({});
    s.overlay.groupNodes([node("a"), node("b")]);
    const [id] = [...s.overlay.groups().keys()];
    expect(id).toBeDefined();
    if (id === undefined) throw new Error("no group minted");
    expect(s.overlay.groups().get(id)?.locked).toBe(false);
    s.overlay.setGroupLabel(id, "Backend");
    expect(s.overlay.groups().get(id)?.label).toBe("Backend");
    s.overlay.setGroupLocked(id, true);
    expect(s.overlay.groups().get(id)?.locked).toBe(true);
    s.overlay.ungroupAt(id);
    expect(s.overlay.groups().size).toBe(0);
    s.destroy();
  });

  it("mints distinct group ids", () => {
    const s = newSession({});
    s.overlay.groupNodes([node("a"), node("b")]);
    s.overlay.groupNodes([node("c"), node("d")]);
    expect(s.overlay.groups().size).toBe(2);
    s.destroy();
  });

  it("clearOverrides drops all overrides", () => {
    const s = newSession({});
    s.overlay.moveNode(n("a"), point(5, 6));
    s.overlay.moveNode(n("b"), point(7, 8));
    s.overlay.clearOverrides();
    expect(s.overlay.overrides().size).toBe(0);
    s.destroy();
  });

  it("pruneGroupsTo is a no-op when all members live, and drops a group when none do", () => {
    const s = newSession({});
    s.overlay.groupNodes([node("a"), node("b")]);
    expect(s.overlay.pruneGroupsTo(new Set([n("a"), n("b")]))).toBe(false); // both live → unchanged
    expect(s.overlay.pruneGroupsTo(new Set([n("z")]))).toBe(true); // none live → group dropped
    expect(s.overlay.groups().size).toBe(0);
    s.destroy();
  });

  it("replace swaps overrides and groups wholesale", () => {
    const s = newSession({});
    s.overlay.moveNode(n("a"), point(1, 1));
    s.overlay.replace(
      new Map([[n("x"), { position: point(9, 9), size: null, pinned: true }]]),
      new Map(),
    );
    expect(s.overlay.overrides().has(n("a"))).toBe(false);
    expect(s.overlay.overrides().get(n("x"))?.position).toEqual(point(9, 9));
    s.destroy();
  });

  it("persist serializes the current overlay through the injected save sink", () => {
    const save = vi.fn();
    const s = newSession({ save });
    s.overlay.moveNode(n("a"), point(3, 4));
    s.overlay.persist();
    expect(save).toHaveBeenCalledOnce();
    const firstCall = save.mock.calls[0];
    if (firstCall === undefined) throw new Error("save was not called");
    const payload = JSON.parse(firstCall[0]);
    expect(payload.overrides).toContainEqual(["a", { position: { x: 3, y: 4 }, size: null, pinned: true }]);
    s.destroy();
  });
});

describe("collab session — undo/redo (UndoManager)", () => {
  it("undoes and redoes a recorded move", () => {
    const s = newSession({});
    s.overlay.record();
    s.overlay.moveNode(n("a"), point(5, 6));
    expect(s.overlay.undo()).toBe(true);
    expect(s.overlay.overrides().has(n("a"))).toBe(false);
    expect(s.overlay.redo()).toBe(true);
    expect(s.overlay.overrides().get(n("a"))?.position).toEqual(point(5, 6));
    s.destroy();
  });

  it("returns false when there is nothing to undo or redo", () => {
    const s = newSession({});
    expect(s.overlay.undo()).toBe(false);
    expect(s.overlay.redo()).toBe(false);
    s.destroy();
  });

  it("record between gestures keeps them as separate undo steps", () => {
    const s = newSession({});
    s.overlay.record();
    s.overlay.moveNode(n("a"), point(1, 1));
    s.overlay.record();
    s.overlay.moveNode(n("b"), point(2, 2));
    expect(s.overlay.undo()).toBe(true); // undo b only
    expect(s.overlay.overrides().has(n("b"))).toBe(false);
    expect(s.overlay.overrides().has(n("a"))).toBe(true);
    s.destroy();
  });

  it("clearHistory empties the undo stack", () => {
    const s = newSession({});
    s.overlay.record();
    s.overlay.moveNode(n("a"), point(1, 1));
    s.overlay.clearHistory();
    expect(s.overlay.undo()).toBe(false);
    s.destroy();
  });
});

describe("collab session — source channel", () => {
  it("setSource replaces the whole document", () => {
    const s = newSession({ source: "old" });
    s.overlay; // touch
    s.setSource("new text");
    expect(s.source()).toBe("new text");
    s.destroy();
  });

  it("spliceSource edits a range in place", () => {
    const s = newSession({ source: "hello world" });
    s.spliceSource(6, 5, "there"); // replace "world"
    expect(s.source()).toBe("hello there");
    s.destroy();
  });

  it("seedSourceIfEmpty seeds an empty doc once, then skips a non-empty one", () => {
    const s = newSession({});
    expect(s.seedSourceIfEmpty("flowchart TD\n  A --> B\n")).toBe(true);
    expect(s.source()).toBe("flowchart TD\n  A --> B\n");
    expect(s.seedSourceIfEmpty("something else")).toBe(false); // already non-empty
    expect(s.source()).toBe("flowchart TD\n  A --> B\n");
    s.destroy();
  });
});
