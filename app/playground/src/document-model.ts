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
import type { GroupId, GroupMember, Groups, LayoutOverrides, SceneNodeId } from "@m/contracts";
import { brand, type Point, type Size } from "@m/std";

// The sidecar overlay document: manual node positions/sizes (`overrides`) plus element groups
// (`groups`), with its own undo/redo history and a pluggable `save` sink. It is the single owner of
// that state, so the rest of the app reads and mutates the overlay only through this seam.
//
// The seam is deliberate: today the only implementation is local + single-user (`createLocalDocument`),
// but a future collaborative backend (the CRDT plan in docs/collab-editor-plan.md) plugs in here —
// a Yjs-backed document with the same interface whose edits sync to peers — without rewriting any
// call site. The diagram source text has the symmetric seam in `Editor` (editor.ts).
export interface OverlayDoc {
  overrides(): LayoutOverrides;
  groups(): Groups;

  // Overlay mutations. None of these persist or record history on their own — the caller drives
  // `record()` (once per gesture) and `persist()` (e.g. on pointer-up), so a multi-node drag is a
  // single history entry and a single save, the same way a hand edit behaves.
  moveNode(id: SceneNodeId, to: Point): void;
  resizeNode(id: SceneNodeId, origin: Point, dim: Size): void;
  clearOverrides(): void;
  groupNodes(units: readonly GroupMember[]): void;
  ungroupAt(top: GroupId): void;
  setGroupLocked(top: GroupId, locked: boolean): void;
  setGroupLabel(id: GroupId, label: string): void;
  // Drop groups whose member nodes the edited text removed; returns whether anything changed.
  pruneGroupsTo(liveNodeIds: ReadonlySet<SceneNodeId>): boolean;
  replace(overrides: LayoutOverrides, groups: Groups): void;

  // Undo/redo over the overlay. `record` snapshots the present state onto the undo stack (and clears
  // redo); `undo`/`redo` swap the live state with a stacked snapshot and return whether one applied.
  record(): void;
  undo(): boolean;
  redo(): boolean;
  clearHistory(): void;

  // Write the current overlay through the injected `save` sink.
  persist(): void;
}

interface OverlaySnapshot {
  readonly overrides: LayoutOverrides;
  readonly groups: Groups;
}

const HISTORY_LIMIT = 100;

// The local, single-user overlay document. State lives in closure variables (the previous module-level
// `overrides`/`groups`/`groupSeq`/`undoStack`/`redoStack`), and `save` is injected so this module never
// touches `localStorage` directly — the app wires the storage write, and a collab backend would wire a
// broadcast instead.
export const createLocalDocument = (opts: {
  readonly initialOverrides: LayoutOverrides;
  readonly initialGroups: Groups;
  readonly save: (serialized: string) => void;
}): OverlayDoc => {
  let overrides: LayoutOverrides = opts.initialOverrides;
  let groups: Groups = opts.initialGroups;
  // Mints fresh group ids; monotonic for the document's lifetime.
  let groupSeq = 0;
  let undoStack: OverlaySnapshot[] = [];
  let redoStack: OverlaySnapshot[] = [];

  const snapshot = (): OverlaySnapshot => ({
    overrides: new Map(overrides),
    groups: new Map(groups),
  });

  return {
    overrides: () => overrides,
    groups: () => groups,
    moveNode: (id, to) => {
      overrides = moveNode(overrides, id, to);
    },
    resizeNode: (id, origin, dim) => {
      overrides = resizeNode(overrides, id, origin, dim);
    },
    clearOverrides: () => {
      overrides = new Map();
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
    replace: (nextOverrides, nextGroups) => {
      overrides = nextOverrides;
      groups = nextGroups;
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
      return true;
    },
    redo: () => {
      const next = redoStack.pop();
      if (next === undefined) return false;
      undoStack.push(snapshot());
      overrides = new Map(next.overrides);
      groups = new Map(next.groups);
      return true;
    },
    clearHistory: () => {
      undoStack = [];
      redoStack = [];
    },
    persist: () => {
      opts.save(serializeOverlay(overrides, groups));
    },
  };
};
