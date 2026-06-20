import { brand } from "@m/std";
import type { GroupId, GroupMember, Groups, SceneNodeId } from "@m/contracts";
import { describe, expect, it } from "vitest";
import {
  group,
  leafNodes,
  parentOf,
  pathLocked,
  pruneGroups,
  setGroupLabel,
  setLocked,
  topGroupOfNode,
  topGroups,
  ungroup,
} from "../../src/core/groups.js";

const n = (s: string): SceneNodeId => brand<string, "SceneNodeId">(s);
const gid = (s: string): GroupId => brand<string, "GroupId">(s);
const node = (s: string): GroupMember => ({ kind: "node", id: n(s) });
const sub = (s: string): GroupMember => ({ kind: "group", id: gid(s) });

describe("groups", () => {
  it("bundles nodes into a new unlocked group, preserving member order", () => {
    const g = group(new Map(), gid("g1"), [node("a"), node("b"), node("c")]);
    expect(g.get(gid("g1"))?.locked).toBe(false);
    expect(g.get(gid("g1"))?.label).toBe("");
    expect(leafNodes(g, gid("g1"))).toEqual([n("a"), n("b"), n("c")]);
  });

  it("sets a group label without changing its members", () => {
    const g = group(new Map(), gid("g1"), [node("a"), node("b")]);
    const labelled = setGroupLabel(g, gid("g1"), "Backend");
    expect(labelled.get(gid("g1"))?.label).toBe("Backend");
    expect(labelled.get(gid("g1"))?.members).toEqual([node("a"), node("b")]);
  });

  it("flattens a huge nested group without an argument-spread overflow", () => {
    // The inner group's leaves flow up through `push(...leafNodes(inner))`; a spread of this many
    // would throw RangeError, so a fold/loop is required. 200k clears every engine's arg-count limit.
    const count = 200_000;
    const inner: GroupMember[] = [];
    for (let i = 0; i < count; i++) inner.push(node(`x${i}`));
    const g: Groups = new Map([
      [gid("outer"), { id: gid("outer"), label: "O", members: [sub("inner")], locked: false }],
      [gid("inner"), { id: gid("inner"), label: "I", members: inner, locked: false }],
    ]);
    expect(leafNodes(g, gid("outer")).length).toBe(count);
  });

  it("nests groups and flattens leaves depth-first in order", () => {
    let g: Groups = group(new Map(), gid("inner"), [node("b"), node("c")]);
    g = group(g, gid("outer"), [node("a"), sub("inner"), node("d")]);
    expect(leafNodes(g, gid("outer"))).toEqual([n("a"), n("b"), n("c"), n("d")]);
    expect(topGroups(g).map((x) => x.id)).toEqual([gid("outer")]); // inner is nested
  });

  it("topGroupOfNode walks up to the outermost group; null when ungrouped", () => {
    let g: Groups = group(new Map(), gid("inner"), [node("b")]);
    g = group(g, gid("outer"), [node("a"), sub("inner")]);
    expect(topGroupOfNode(g, n("b"))).toBe(gid("outer"));
    expect(topGroupOfNode(g, n("a"))).toBe(gid("outer"));
    expect(topGroupOfNode(g, n("z"))).toBe(null);
  });

  it("ungroup of a nested group splices its members into the parent in place", () => {
    let g: Groups = group(new Map(), gid("inner"), [node("b"), node("c")]);
    g = group(g, gid("outer"), [node("a"), sub("inner"), node("d")]);
    const after = ungroup(g, gid("inner"));
    expect(after.has(gid("inner"))).toBe(false);
    expect(after.get(gid("outer"))?.members).toEqual([node("a"), node("b"), node("c"), node("d")]);
    // leaves are unchanged in order — "unbundled in the same order"
    expect(leafNodes(after, gid("outer"))).toEqual([n("a"), n("b"), n("c"), n("d")]);
  });

  it("ungroup of a top-level group frees its nodes and promotes its subgroups", () => {
    let g: Groups = group(new Map(), gid("inner"), [node("b")]);
    g = group(g, gid("outer"), [node("a"), sub("inner")]);
    const after = ungroup(g, gid("outer"));
    expect(after.has(gid("outer"))).toBe(false);
    expect(topGroupOfNode(after, n("a"))).toBe(null); // a is now free
    expect(topGroupOfNode(after, n("b"))).toBe(gid("inner")); // inner survives, now top-level
    expect(topGroups(after).map((x) => x.id)).toEqual([gid("inner")]);
  });

  it("setLocked toggles a group; pathLocked sees a lock anywhere up the chain", () => {
    let g: Groups = group(new Map(), gid("inner"), [node("b")]);
    g = group(g, gid("outer"), [node("a"), sub("inner")]);
    expect(pathLocked(g, n("b"))).toBe(false);
    const locked = setLocked(g, gid("outer"), true);
    expect(locked.get(gid("outer"))?.locked).toBe(true);
    expect(pathLocked(locked, n("b"))).toBe(true); // outer (ancestor of inner) is locked
    expect(pathLocked(locked, n("a"))).toBe(true);
    // locking only the inner blocks its members, not its siblings
    const innerLocked = setLocked(g, gid("inner"), true);
    expect(pathLocked(innerLocked, n("b"))).toBe(true);
    expect(pathLocked(innerLocked, n("a"))).toBe(false);
  });

  it("parentOf distinguishes a node and a group sharing an id string", () => {
    // A node "x" and a group "x" are different members.
    let g: Groups = group(new Map(), gid("x"), [node("leaf")]);
    g = group(g, gid("top"), [node("x"), sub("x")]);
    expect(parentOf(g, node("x"))).toBe(gid("top"));
    expect(parentOf(g, sub("x"))).toBe(gid("top"));
    expect(parentOf(g, node("leaf"))).toBe(gid("x"));
  });

  it("ungroup / setLocked on a missing id is a no-op (returns the same map)", () => {
    const g = group(new Map(), gid("g1"), [node("a")]);
    expect(ungroup(g, gid("nope"))).toBe(g);
    expect(setLocked(g, gid("nope"), true)).toBe(g);
    expect(setGroupLabel(g, gid("nope"), "x")).toBe(g);
  });

  it("pruneGroups drops members for gone nodes and empties that cascade out", () => {
    // g1 = {a, b}; g2 (outer) = {g1, c}. Drop node b and c → g1 = {a}, g2 = {g1}.
    let g: Groups = group(new Map(), gid("g1"), [node("a"), node("b")]);
    g = group(g, gid("g2"), [sub("g1"), node("c")]);
    const pruned = pruneGroups(g, new Set([n("a")]));
    expect(leafNodes(pruned, gid("g1"))).toEqual([n("a")]);
    expect(pruned.get(gid("g2"))?.members).toEqual([sub("g1")]);
  });

  it("pruneGroups removes a group whose nodes all vanished (no stale resurrection)", () => {
    const g = group(new Map(), gid("g1"), [node("a"), node("b")]);
    expect(pruneGroups(g, new Set<SceneNodeId>()).size).toBe(0);
    // a group whose every node still exists is untouched.
    const live = new Set([n("a"), n("b")]);
    expect(pruneGroups(g, live).get(gid("g1"))?.members).toEqual([node("a"), node("b")]);
  });
});
