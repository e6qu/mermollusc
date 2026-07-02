import { brand, point, size, type LogRecord } from "@m/std";
import type { GroupMember, Groups, LayoutOverrides, SceneNodeId } from "@m/contracts";
import { applyUpdate, Doc, encodeStateAsUpdate, type Map as YMap } from "yjs";
import { describe, expect, it, vi } from "vitest";
import { type CollabEvent, type CollabStatus, createCollabSession } from "../../src/index.js";

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

  it("replaceOverrides swaps the override map wholesale, leaving groups intact", () => {
    const s = newSession({});
    s.overlay.groupNodes([node("a"), node("b")]);
    s.overlay.moveNode(n("a"), point(1, 1));
    s.overlay.replaceOverrides(
      new Map([[n("x"), { position: point(9, 9), size: null, pinned: true }]]),
    );
    expect(s.overlay.overrides().has(n("a"))).toBe(false);
    expect(s.overlay.overrides().get(n("x"))?.position).toEqual(point(9, 9));
    expect(s.overlay.groups().size).toBe(1); // groups untouched by an override replacement
    s.destroy();
  });

  it("replace swaps overrides and groups wholesale", () => {
    const s = newSession({});
    s.overlay.moveNode(n("a"), point(1, 1));
    s.overlay.replace(
      new Map([[n("x"), { position: point(9, 9), size: null, pinned: true }]]),
      new Map(),
      new Map(),
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

  it("undoes and redoes a groupNodes call", () => {
    const s = newSession({});
    s.overlay.record();
    s.overlay.groupNodes([node("a"), node("b")]);
    expect(s.overlay.groups().size).toBe(1);
    expect(s.overlay.undo()).toBe(true);
    expect(s.overlay.groups().size).toBe(0);
    expect(s.overlay.redo()).toBe(true);
    expect(s.overlay.groups().size).toBe(1);
    s.destroy();
  });

  it("undoes a top-level ungroupAt, restoring the group", () => {
    const s = newSession({});
    s.overlay.groupNodes([node("a"), node("b"), node("c")]);
    const [id] = [...s.overlay.groups().keys()];
    if (id === undefined) throw new Error("no group minted");
    s.overlay.record();
    s.overlay.ungroupAt(id);
    expect(s.overlay.groups().size).toBe(0);
    expect(s.overlay.undo()).toBe(true);
    expect(s.overlay.groups().size).toBe(1);
    expect(s.overlay.groups().get(id)?.members).toEqual([node("a"), node("b"), node("c")]);
    s.destroy();
  });

  it("undoes an ungroupAt that dissolved a nested subgroup, restoring the parent's spliced-in members", () => {
    const s = newSession({});
    s.overlay.groupNodes([node("a"), node("b")]); // the inner group
    const [inner] = [...s.overlay.groups().keys()];
    if (inner === undefined) throw new Error("no inner group minted");
    s.overlay.groupNodes([{ kind: "group", id: inner }, node("c")]); // outer nests inner
    const outer = [...s.overlay.groups().keys()].find((k) => k !== inner);
    if (outer === undefined) throw new Error("no outer group minted");
    s.overlay.record();
    s.overlay.ungroupAt(inner);
    expect(s.overlay.groups().size).toBe(1);
    expect(s.overlay.groups().get(outer)?.members).toEqual([node("a"), node("b"), node("c")]);
    expect(s.overlay.undo()).toBe(true);
    expect(s.overlay.groups().size).toBe(2);
    expect(s.overlay.groups().get(outer)?.members).toEqual([{ kind: "group", id: inner }, node("c")]);
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

describe("collab session — corrupt group members container", () => {
  it("ungroupAt degrades loudly (no throw) when a remote peer replaced a parent's members Y.Array", () => {
    const records: LogRecord<CollabEvent>[] = [];
    const s = createCollabSession({
      initialOverrides: new Map(),
      initialGroups: new Map(),
      initialSource: "",
      save: () => {},
      logger: { log: (r) => records.push(r) },
    });
    s.overlay.groupNodes([node("a"), node("b")]); // inner
    const [inner] = [...s.overlay.groups().keys()];
    if (inner === undefined) throw new Error("no inner group minted");
    s.overlay.groupNodes([{ kind: "group", id: inner }, node("c")]); // outer nests inner
    const outer = [...s.overlay.groups().keys()].find((k) => k !== inner);
    if (outer === undefined) throw new Error("no outer group minted");

    // A malicious/buggy peer replaces the outer group's members Y.Array with a plain string. The decode
    // guard keeps last-good cache; the targeted splice in ungroupAt must then reject the corrupt
    // container loudly instead of calling toArray() on a string and throwing out of the transaction.
    const peer = new Doc();
    applyUpdate(peer, s.state());
    const yOuter = peer.getMap<YMap<unknown>>("groups").get(outer);
    if (yOuter === undefined) throw new Error("outer group missing in peer doc");
    yOuter.set("members", "corrupt");
    s.applyUpdate(encodeStateAsUpdate(peer));

    expect(() => s.overlay.ungroupAt(inner)).not.toThrow();
    expect(records.map((r) => r.event)).toContain("overlay-decode-rejected");
    s.destroy();
  });
});

// A remote update carrying a malformed overrides entry — `position` is missing its `y`, so the shared
// decoder rejects it. Built on a raw Y.Doc with the same map shape, then encoded as a state update the
// session would receive from a peer/relay.
const corruptRemoteUpdate = (): Uint8Array => {
  const d = new Doc();
  d.getMap("overrides").set("bad", { position: { x: 1 }, size: null, pinned: true });
  return encodeStateAsUpdate(d);
};

describe("collab session — corrupt remote overlay (decode-as-Result)", () => {
  it("logs overlay-decode-rejected, surfaces a status, and keeps last-good state (no throw)", () => {
    const records: LogRecord<CollabEvent>[] = [];
    const s = createCollabSession({
      initialOverrides: new Map([[n("a"), { position: point(10, 20), size: null, pinned: true }]]),
      initialGroups: new Map(),
      initialSource: "",
      save: () => {},
      logger: { log: (r) => records.push(r) },
    });
    const seen: CollabStatus[] = [];
    s.onStatusChange((st) => seen.push(st));

    // Applying the corrupt peer update must NOT throw out of the Yjs observer.
    expect(() => s.applyUpdate(corruptRemoteUpdate())).not.toThrow();

    // It logs loudly via the closed event union and surfaces the rejected status…
    expect(records.map((r) => r.event)).toContain("overlay-decode-rejected");
    expect(records.some((r) => r.level === "error")).toBe(true);
    expect(seen).toContain("overlay-rejected");
    // …and keeps the last-good materialised overlay (the corrupt entry is ignored, not adopted).
    expect(s.overlay.overrides().get(n("a"))?.position).toEqual(point(10, 20));
    expect(s.overlay.overrides().has(n("bad"))).toBe(false);
    s.destroy();
  });
});
