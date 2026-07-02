import { brand, point } from "@m/std";
import type { LayoutOverrides, SceneNodeId } from "@m/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createCollabSession, type CollabSession } from "../../src/index.js";

const n = (s: string): SceneNodeId => brand<string, "SceneNodeId">(s);

const blank = (source = ""): CollabSession =>
  createCollabSession({
    initialOverrides: new Map(),
    initialGroups: new Map(),
    initialSource: source,
    save: () => {},
  });

// Bring `b` up to `a`'s full state, then wire both ways so live updates flow. Returns a disconnect fn.
const link = (a: CollabSession, b: CollabSession): (() => void) => {
  b.applyUpdate(a.state());
  a.applyUpdate(b.state());
  const ua = a.onUpdate((u) => b.applyUpdate(u));
  const ub = b.onUpdate((u) => a.applyUpdate(u));
  return () => {
    ua();
    ub();
  };
};

// Full bidirectional state exchange — converges two peers regardless of what each did while apart.
const exchange = (a: CollabSession, b: CollabSession): void => {
  b.applyUpdate(a.state());
  a.applyUpdate(b.state());
};

const overridesEqual = (x: LayoutOverrides, y: LayoutOverrides): boolean => {
  if (x.size !== y.size) return false;
  for (const [id, o] of x) {
    const p = y.get(id);
    if (p === undefined || p.position.x !== o.position.x || p.position.y !== o.position.y) return false;
  }
  return true;
};

describe("collab convergence — overlay", () => {
  it("a late joiner receives the seeded state", () => {
    const a = blank("flowchart TD\n  A --> B\n");
    a.overlay.moveNode(n("A"), point(100, 200));
    const b = blank();
    b.applyUpdate(a.state());
    expect(b.source()).toBe("flowchart TD\n  A --> B\n");
    expect(b.overlay.overrides().get(n("A"))?.position).toEqual(point(100, 200));
    a.destroy();
    b.destroy();
  });

  it("concurrent moves of different nodes both survive (no lost update)", () => {
    const a = blank();
    const b = blank();
    b.applyUpdate(a.state());
    // edit independently (no live link), then exchange
    a.overlay.moveNode(n("A"), point(1, 1));
    b.overlay.moveNode(n("B"), point(2, 2));
    exchange(a, b);
    for (const s of [a, b]) {
      expect(s.overlay.overrides().get(n("A"))?.position).toEqual(point(1, 1));
      expect(s.overlay.overrides().get(n("B"))?.position).toEqual(point(2, 2));
    }
    a.destroy();
    b.destroy();
  });

  it("concurrent moves of the SAME node converge to one agreed value (LWW)", () => {
    const a = blank();
    const b = blank();
    b.applyUpdate(a.state());
    a.overlay.moveNode(n("A"), point(1, 1));
    b.overlay.moveNode(n("A"), point(9, 9));
    exchange(a, b);
    const pa = a.overlay.overrides().get(n("A"))?.position;
    const pb = b.overlay.overrides().get(n("A"))?.position;
    expect(pa).toEqual(pb); // agree
    expect([JSON.stringify(point(1, 1)), JSON.stringify(point(9, 9))]).toContain(JSON.stringify(pa));
    a.destroy();
    b.destroy();
  });

  it("live link propagates an overlay edit and fires onOverlayChange on the peer", () => {
    const a = blank();
    const b = blank();
    const cut = link(a, b);
    let fired = 0;
    b.onOverlayChange(() => {
      fired += 1;
    });
    a.overlay.moveNode(n("A"), point(7, 7));
    expect(b.overlay.overrides().get(n("A"))?.position).toEqual(point(7, 7));
    expect(fired).toBeGreaterThan(0);
    cut();
    a.destroy();
    b.destroy();
  });

  it("two clients each grouping concurrently both survive (collision-proof ids)", () => {
    const a = blank();
    const b = blank();
    b.applyUpdate(a.state());
    // Each client mints a group while apart. With a shared `g0` counter both would overwrite the same
    // key; the clientID-namespaced id keeps them distinct, so both groups survive the merge.
    a.overlay.groupNodes([
      { kind: "node", id: n("A") },
      { kind: "node", id: n("B") },
    ]);
    b.overlay.groupNodes([
      { kind: "node", id: n("C") },
      { kind: "node", id: n("D") },
    ]);
    exchange(a, b);
    exchange(a, b);
    for (const s of [a, b]) {
      expect(s.overlay.groups().size).toBe(2); // neither client's group was overwritten
    }
    // The two minted ids differ (the clientID prefix), and the member sets are preserved per group.
    const ids = [...a.overlay.groups().keys()];
    expect(new Set(ids).size).toBe(2);
    a.destroy();
    b.destroy();
  });

  it("two clients concurrently ungrouping different children of the same parent both survive", () => {
    const a = blank();
    a.overlay.groupNodes([{ kind: "node", id: n("A") }, { kind: "node", id: n("B") }]);
    const g1 = [...a.overlay.groups().keys()][0];
    a.overlay.groupNodes([{ kind: "node", id: n("C") }, { kind: "node", id: n("D") }]);
    const g2 = [...a.overlay.groups().keys()].find((k) => k !== g1);
    if (g1 === undefined || g2 === undefined) throw new Error("inner groups not minted");
    a.overlay.groupNodes([
      { kind: "group", id: g1 },
      { kind: "group", id: g2 },
      { kind: "node", id: n("E") },
    ]);
    const parent = [...a.overlay.groups().keys()].find((k) => k !== g1 && k !== g2);
    if (parent === undefined) throw new Error("parent group not minted");

    const b = blank();
    b.applyUpdate(a.state());

    // Each client dissolves a DIFFERENT child of the same parent while apart. Under the old whole-group
    // LWW write, whichever client's rewrite of the parent's members landed last would win outright —
    // dropping the other's freed members and leaving a dangling reference to an already-deleted group.
    a.overlay.ungroupAt(g1);
    b.overlay.ungroupAt(g2);
    exchange(a, b);
    exchange(a, b);

    for (const s of [a, b]) {
      expect(s.overlay.groups().size).toBe(1); // both children dissolved; only the parent remains
      const pg = s.overlay.groups().get(parent);
      expect(pg).toBeDefined();
      const keys = new Set(pg?.members.map((m) => `${m.kind}:${m.id}`));
      expect(keys).toEqual(new Set(["node:A", "node:B", "node:C", "node:D", "node:E"]));
    }
    a.destroy();
    b.destroy();
  });

  it("two clients concurrently pruning different dead members of the same group both survive", () => {
    const a = blank();
    a.overlay.groupNodes([
      { kind: "node", id: n("A") },
      { kind: "node", id: n("B") },
      { kind: "node", id: n("C") },
    ]);
    const [gid] = [...a.overlay.groups().keys()];
    if (gid === undefined) throw new Error("no group minted");
    const b = blank();
    b.applyUpdate(a.state());

    // Each client learns of a DIFFERENT dead node and prunes it from the same group while apart. Under
    // the old whole-group LWW write, one client's prune would silently undo the other's.
    a.overlay.pruneGroupsTo(new Set([n("B"), n("C")])); // A died
    b.overlay.pruneGroupsTo(new Set([n("A"), n("C")])); // B died
    exchange(a, b);
    exchange(a, b);

    for (const s of [a, b]) {
      const g = s.overlay.groups().get(gid);
      expect(g).toBeDefined();
      expect(g?.members.map((m) => m.id)).toEqual(["C"]); // both A and B pruned, C survives
    }
    a.destroy();
    b.destroy();
  });

  it("a concurrent group on one side merges with a move on the other", () => {
    const a = blank();
    const b = blank();
    b.applyUpdate(a.state());
    a.overlay.groupNodes([
      { kind: "node", id: n("A") },
      { kind: "node", id: n("B") },
    ]);
    b.overlay.moveNode(n("C"), point(3, 3));
    exchange(a, b);
    for (const s of [a, b]) {
      expect(s.overlay.groups().size).toBe(1);
      expect(s.overlay.overrides().get(n("C"))?.position).toEqual(point(3, 3));
    }
    a.destroy();
    b.destroy();
  });
});

describe("collab convergence — source text", () => {
  it("concurrent splices at different offsets both survive (character CRDT merge)", () => {
    const a = blank("AC");
    const b = blank();
    b.applyUpdate(a.state());
    // a inserts "B" between A and C (offset 1); b appends "D" at the end (offset 2)
    a.spliceSource(1, 0, "B");
    b.spliceSource(2, 0, "D");
    exchange(a, b);
    expect(a.source()).toBe(b.source());
    expect(a.source()).toContain("A");
    expect(a.source()).toContain("B");
    expect(a.source()).toContain("C");
    expect(a.source()).toContain("D");
    a.destroy();
    b.destroy();
  });

  it("fires onSourceChange on the remote peer only", () => {
    const a = blank("x");
    const b = blank();
    const cut = link(a, b);
    let bSaw = "";
    let aSaw = 0;
    b.onSourceChange((t) => {
      bSaw = t;
    });
    a.onSourceChange(() => {
      aSaw += 1; // a's own edit must not echo back to a
    });
    a.spliceSource(1, 0, "y");
    expect(bSaw).toBe("xy");
    expect(aSaw).toBe(0);
    cut();
    a.destroy();
    b.destroy();
  });
});

describe("collab convergence — property", () => {
  it("any interleaving of independent moves converges to the same overlay", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            who: fc.constantFrom("a", "b"),
            id: fc.constantFrom("A", "B", "C", "D"),
            x: fc.integer({ min: -50, max: 50 }),
            y: fc.integer({ min: -50, max: 50 }),
          }),
          { maxLength: 20 },
        ),
        (ops) => {
          const a = blank();
          const b = blank();
          b.applyUpdate(a.state());
          for (const op of ops) {
            (op.who === "a" ? a : b).overlay.moveNode(n(op.id), point(op.x, op.y));
          }
          exchange(a, b);
          exchange(a, b); // a second round settles any value either side learned in the first
          const converged = overridesEqual(a.overlay.overrides(), b.overlay.overrides());
          a.destroy();
          b.destroy();
          return converged;
        },
      ),
    );
  });
});
