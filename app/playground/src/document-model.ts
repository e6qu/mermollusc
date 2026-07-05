import {
  group,
  moveNode,
  pruneGroups,
  resizeNode,
  serializeOverlay,
  setGroupLabel,
  setLocked,
  ungroup,
} from "@m/builder";
import type { EdgeStyles, Groups, LayoutOverrides, NodeStyles, OverlayDoc } from "@m/contracts";
import { brand } from "@m/std";

// The local, single-user implementation of the `OverlayDoc` port (defined in `@m/contracts` so the
// Yjs-backed collaborative implementation in `@m/collab` shares the exact interface). State lives in
// closure variables and `save` is injected, so this module never touches `localStorage` directly —
// the app wires the storage write; a collaborative backend wires a broadcast instead. The diagram
// source text has the symmetric seam in `Editor` (editor.ts).

interface OverlaySnapshot {
  readonly overrides: LayoutOverrides;
  readonly groups: Groups;
  readonly edgeStyles: EdgeStyles;
  readonly nodeStyles: NodeStyles;
}

const HISTORY_LIMIT = 100;

// Group ids are minted `g<n>`. Seed the counter past any id already in the map, so a reload (or a
// `replace` from a persisted/shared overlay) can never re-mint an id that's already taken and silently
// overwrite an existing group.
const nextGroupSeqFrom = (groups: Groups): number => {
  let max = -1;
  for (const id of groups.keys()) {
    const digits = /^g(\d+)$/.exec(id)?.[1];
    if (digits !== undefined) max = Math.max(max, Number(digits));
  }
  return max + 1;
};

// The local, single-user overlay document. State lives in closure variables (the previous module-level
// `overrides`/`groups`/`groupSeq`/`undoStack`/`redoStack`), and `save` is injected so this module never
// touches `localStorage` directly — the app wires the storage write, and a collab backend would wire a
// broadcast instead.
export const createLocalDocument = (opts: {
  readonly initialOverrides: LayoutOverrides;
  readonly initialGroups: Groups;
  readonly initialEdgeStyles: EdgeStyles;
  readonly initialNodeStyles: NodeStyles;
  readonly save: (serialized: string) => void;
}): OverlayDoc => {
  let overrides: LayoutOverrides = opts.initialOverrides;
  let groups: Groups = opts.initialGroups;
  let edgeStyles: EdgeStyles = opts.initialEdgeStyles;
  let nodeStyles: NodeStyles = opts.initialNodeStyles;
  // Mints fresh group ids; monotonic for the document's lifetime, seeded past any pre-existing ids.
  let groupSeq = nextGroupSeqFrom(opts.initialGroups);
  let undoStack: OverlaySnapshot[] = [];
  let redoStack: OverlaySnapshot[] = [];

  const snapshot = (): OverlaySnapshot => ({
    overrides: new Map(overrides),
    groups: new Map(groups),
    edgeStyles: new Map(edgeStyles),
    nodeStyles: new Map(nodeStyles),
  });

  return {
    overrides: () => overrides,
    groups: () => groups,
    edgeStyles: () => edgeStyles,
    nodeStyles: () => nodeStyles,
    setEdgeStyle: (id, style) => {
      const next = new Map(edgeStyles);
      if (style === null) next.delete(id);
      else next.set(id, style);
      edgeStyles = next;
    },
    setNodeStyle: (id, style) => {
      const next = new Map(nodeStyles);
      if (style === null) next.delete(id);
      else next.set(id, style);
      nodeStyles = next;
    },
    moveNode: (id, to) => {
      overrides = moveNode(overrides, id, to);
    },
    resizeNode: (id, origin, dim) => {
      overrides = resizeNode(overrides, id, origin, dim);
    },
    clearOverrides: () => {
      overrides = new Map();
    },
    replaceOverrides: (nextOverrides) => {
      overrides = nextOverrides;
    },
    groupNodes: (units) => {
      groups = group(groups, brand<string, "GroupId">(`g${groupSeq++}`), units);
    },
    ungroupAt: (top) => {
      groups = ungroup(groups, top);
    },
    setGroupLocked: (top, locked) => {
      groups = setLocked(groups, top, locked);
    },
    setGroupLabel: (id, label) => {
      groups = setGroupLabel(groups, id, label);
    },
    pruneGroupsTo: (liveNodeIds) => {
      const pruned = pruneGroups(groups, liveNodeIds);
      if (pruned === groups) return false;
      groups = pruned;
      return true;
    },
    replace: (nextOverrides, nextGroups, nextEdgeStyles, nextNodeStyles) => {
      overrides = nextOverrides;
      groups = nextGroups;
      edgeStyles = nextEdgeStyles;
      nodeStyles = nextNodeStyles;
      groupSeq = Math.max(groupSeq, nextGroupSeqFrom(nextGroups));
    },
    record: () => {
      undoStack.push(snapshot());
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack = [];
    },
    undo: () => {
      const prev = undoStack.pop();
      if (prev === undefined) return false;
      redoStack.push(snapshot());
      overrides = new Map(prev.overrides);
      groups = new Map(prev.groups);
      edgeStyles = new Map(prev.edgeStyles);
      nodeStyles = new Map(prev.nodeStyles);
      return true;
    },
    redo: () => {
      const next = redoStack.pop();
      if (next === undefined) return false;
      undoStack.push(snapshot());
      overrides = new Map(next.overrides);
      groups = new Map(next.groups);
      edgeStyles = new Map(next.edgeStyles);
      nodeStyles = new Map(next.nodeStyles);
      return true;
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    clearHistory: () => {
      undoStack = [];
      redoStack = [];
    },
    persist: () => {
      opts.save(serializeOverlay(overrides, groups, edgeStyles, nodeStyles));
    },
  };
};
