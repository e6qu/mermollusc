import type { Group, GroupId, GroupMember, Groups, SceneNodeId } from "@m/contracts";

const sameMember = (a: GroupMember, b: GroupMember): boolean => a.kind === b.kind && a.id === b.id;

// Bundle `members` (scene nodes and/or existing groups) into a new group `id`, unlocked. The caller
// supplies a fresh id — id minting (a side effect) stays out of this pure core.
export const group = (
  groups: Groups,
  id: GroupId,
  members: readonly GroupMember[],
  label = "",
): Groups => {
  const next = new Map(groups);
  next.set(id, { id, label, members, locked: false });
  return next;
};

// The group that directly lists `member`, or null if it's top-level / absent.
export const parentOf = (groups: Groups, member: GroupMember): GroupId | null => {
  for (const g of groups.values()) {
    if (g.members.some((m) => sameMember(m, member))) return g.id;
  }
  return null;
};

// Dissolve `id`: its members take its place in the parent's member list (preserving order), or
// simply become free/top-level when `id` was top-level. Nested subgroups stay intact.
export const ungroup = (groups: Groups, id: GroupId): Groups => {
  const dissolved = groups.get(id);
  if (dissolved === undefined) return groups;
  const next = new Map(groups);
  next.delete(id);
  const parent = parentOf(groups, { kind: "group", id });
  if (parent !== null) {
    const p = next.get(parent);
    if (p !== undefined) {
      const members = p.members.flatMap((m) =>
        m.kind === "group" && m.id === id ? dissolved.members : [m],
      );
      next.set(parent, { ...p, members });
    }
  }
  return next;
};

export const setLocked = (groups: Groups, id: GroupId, locked: boolean): Groups => {
  const g = groups.get(id);
  if (g === undefined || g.locked === locked) return groups;
  return new Map(groups).set(id, { ...g, locked });
};

export const setGroupLabel = (groups: Groups, id: GroupId, label: string): Groups => {
  const g = groups.get(id);
  if (g === undefined || g.label === label) return groups;
  return new Map(groups).set(id, { ...g, label });
};

// Every leaf scene node under `id`, recursively, in member order.
export const leafNodes = (groups: Groups, id: GroupId): readonly SceneNodeId[] => {
  const g = groups.get(id);
  if (g === undefined) return [];
  const out: SceneNodeId[] = [];
  for (const m of g.members) {
    if (m.kind === "node") out.push(m.id);
    // A loop, not `push(...)`: a spread of a large nested group's leaves would exceed the
    // argument-count limit and throw.
    else for (const leaf of leafNodes(groups, m.id)) out.push(leaf);
  }
  return out;
};

// The outermost group containing `node` (walking up the nesting), or null if it isn't grouped.
export const topGroupOfNode = (groups: Groups, node: SceneNodeId): GroupId | null => {
  let current = parentOf(groups, { kind: "node", id: node });
  if (current === null) return null;
  for (;;) {
    const up: GroupId | null = parentOf(groups, { kind: "group", id: current });
    if (up === null) return current;
    current = up;
  }
};

// Whether any group on `node`'s ancestor chain is locked — i.e. the node can't be dragged.
export const pathLocked = (groups: Groups, node: SceneNodeId): boolean => {
  let current: GroupId | null = parentOf(groups, { kind: "node", id: node });
  while (current !== null) {
    if (groups.get(current)?.locked === true) return true;
    current = parentOf(groups, { kind: "group", id: current });
  }
  return false;
};

// Drop group members that reference scene nodes no longer present (and subgroups that thereby become
// empty), so a sidecar group can't outlive the diagram it described — e.g. resurrect onto reused ids
// after the text is edited away and back. Fixpoint: removing a node member can empty a group, which
// then drops from its parent, until the set stabilises (membership only ever shrinks).
export const pruneGroups = (groups: Groups, liveNodes: ReadonlySet<SceneNodeId>): Groups => {
  // Nothing dead → return the input unchanged, so callers can detect a no-op by identity. (Only a
  // dead *node* member can start a cascade; an empty group can only arise from one.)
  const hasDead = [...groups.values()].some((g) =>
    g.members.some((m) => m.kind === "node" && !liveNodes.has(m.id)),
  );
  if (!hasDead) return groups;
  const memberCount = (gs: Groups): number => {
    let n = 0;
    for (const g of gs.values()) n += g.members.length;
    return n;
  };
  let current: Groups = groups;
  for (;;) {
    const next = new Map<GroupId, Group>();
    for (const [id, g] of current) {
      const members = g.members.filter((m) =>
        m.kind === "node" ? liveNodes.has(m.id) : current.has(m.id),
      );
      if (members.length > 0) {
        next.set(id, members.length === g.members.length ? g : { ...g, members });
      }
    }
    if (next.size === current.size && memberCount(next) === memberCount(current)) return next;
    current = next;
  }
};

// Top-level groups (those not nested inside another), in insertion order.
export const topGroups = (groups: Groups): readonly Group[] => {
  const out: Group[] = [];
  for (const g of groups.values()) {
    if (parentOf(groups, { kind: "group", id: g.id }) === null) out.push(g);
  }
  return out;
};
