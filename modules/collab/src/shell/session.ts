import {
  Doc,
  type Map as YMap,
  type Text as YText,
  UndoManager,
  applyUpdate,
  encodeStateAsUpdate,
} from "yjs";
import {
  decodeOverlay,
  group,
  moveNode,
  pruneGroups,
  resizeNode,
  serializeOverlay,
  setGroupLabel,
  setLocked,
  ungroup,
} from "@m/builder";
import type { Group, Groups, LayoutOverrides, NodeOverride, OverlayDoc } from "@m/contracts";
import { brand, isOk, type Point, type Size } from "@m/std";

// A collaborative document: the diagram **source text** (a `Y.Text`) and the sidecar **overlay**
// (overrides + groups, in two `Y.Map`s) share one `Y.Doc`, so concurrent edits merge as a CRDT. The
// rendered diagram is *not* shared — each client re-derives it locally from the merged source+overlay
// (see docs/collab-editor-plan.md §4), keeping the doc tiny and conflict-free.
//
// `overlay` satisfies the same `OverlayDoc` port as the local single-user document, so the app swaps
// one for the other without touching call sites. Transport is left to the caller: `state`/`applyUpdate`
// /`onUpdate` are the binary-sync seam a WebSocket server (or an in-memory test) wires together.
export interface CollabSession {
  readonly overlay: OverlayDoc;

  source(): string;
  setSource(text: string): void;
  // Character-level edit (the CRDT-friendly path: concurrent splices at different offsets both survive).
  spliceSource(index: number, deleteCount: number, insert: string): void;
  // Fires on *remote* source changes only (local edits don't echo back). Returns an unsubscribe fn.
  onSourceChange(listener: (text: string) => void): () => void;
  // Fires on *remote* / undo-driven overlay changes (local mutations update synchronously in place).
  onOverlayChange(listener: () => void): () => void;

  // Binary sync seam. `state` is the whole-document update for a joining peer; `applyUpdate` integrates
  // a peer's update; `onUpdate` emits this client's *own* updates to broadcast (applied remote updates
  // are not re-emitted, so a relay can't loop).
  state(): Uint8Array;
  applyUpdate(update: Uint8Array): void;
  onUpdate(listener: (update: Uint8Array) => void): () => void;

  destroy(): void;
}

// Yjs transaction origins. Local edits are tracked for undo and broadcast; applied remote updates are
// neither re-broadcast nor (re)materialised redundantly; the initial seed is excluded from history.
const LOCAL = Symbol("collab/local");
const REMOTE = Symbol("collab/remote");
const SEED = Symbol("collab/seed");

const encodeOverride = (o: NodeOverride): unknown => ({
  position: { x: o.position.x, y: o.position.y },
  size: o.size === null ? null : { width: o.size.width, height: o.size.height },
  pinned: o.pinned,
});

const encodeGroup = (g: Group): unknown => ({
  id: g.id,
  label: g.label,
  members: g.members.map((m) => ({ kind: m.kind, id: m.id })),
  locked: g.locked,
});

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export const createCollabSession = (opts: {
  readonly initialOverrides: LayoutOverrides;
  readonly initialGroups: Groups;
  readonly initialSource: string;
  readonly save: (serialized: string) => void;
}): CollabSession => {
  const doc = new Doc();
  const yText: YText = doc.getText("source");
  const yOverrides: YMap<unknown> = doc.getMap("overrides");
  const yGroups: YMap<unknown> = doc.getMap("groups");

  // Local materialised view (branded). Local mutations update it synchronously; remote/undo changes
  // rebuild it from the Y.Maps through the shared Zod decoder, so peer data crosses the boundary
  // validated — never trusted raw.
  let cache: { overrides: LayoutOverrides; groups: Groups } = {
    overrides: opts.initialOverrides,
    groups: opts.initialGroups,
  };
  // Mints fresh group ids; monotonic for the document's lifetime.
  let groupSeq = 0;

  const materialize = (): { overrides: LayoutOverrides; groups: Groups } => {
    const overrides: Array<[string, unknown]> = [];
    yOverrides.forEach((v, k) => {
      overrides.push([k, v]);
    });
    const groups: Array<[string, unknown]> = [];
    yGroups.forEach((v, k) => {
      groups.push([k, v]);
    });
    const decoded = decodeOverlay({ overrides, groups });
    if (!isOk(decoded)) {
      throw new Error(`collab: overlay decode failed — ${decoded.error.issues.join("; ")}`);
    }
    return { overrides: decoded.value.overrides, groups: decoded.value.groups };
  };

  const writeOverrides = (next: LayoutOverrides): void => {
    doc.transact(() => {
      for (const [id, o] of next) {
        const enc = encodeOverride(o);
        if (!sameJson(yOverrides.get(id), enc)) yOverrides.set(id, enc);
      }
      for (const k of [...yOverrides.keys()])
        if (!next.has(brand<string, "SceneNodeId">(k))) yOverrides.delete(k);
    }, LOCAL);
  };

  const writeGroups = (next: Groups): void => {
    doc.transact(() => {
      for (const [id, g] of next) {
        const enc = encodeGroup(g);
        if (!sameJson(yGroups.get(id), enc)) yGroups.set(id, enc);
      }
      for (const k of [...yGroups.keys()])
        if (!next.has(brand<string, "GroupId">(k))) yGroups.delete(k);
    }, LOCAL);
  };

  // Seed the shared doc with the caller's starting state, outside undo history.
  doc.transact(() => {
    if (opts.initialSource.length > 0) yText.insert(0, opts.initialSource);
    for (const [id, o] of opts.initialOverrides) yOverrides.set(id, encodeOverride(o));
    for (const [id, g] of opts.initialGroups) yGroups.set(id, encodeGroup(g));
  }, SEED);

  const undoManager = new UndoManager([yOverrides, yGroups], { trackedOrigins: new Set([LOCAL]) });

  const overlayListeners = new Set<() => void>();
  const sourceListeners = new Set<(text: string) => void>();
  const updateListeners = new Set<(update: Uint8Array) => void>();

  const notifyOverlay = (): void => {
    for (const l of overlayListeners) l();
  };

  // Remote or undo/redo edits (origin ≠ LOCAL) rebuild the cache from the Y.Maps; local edits already
  // set `cache` in place, so re-materialising them would be wasted work.
  const onMapChange = (origin: unknown): void => {
    if (origin === LOCAL) return;
    cache = materialize();
    notifyOverlay();
  };
  yOverrides.observe((e) => onMapChange(e.transaction.origin));
  yGroups.observe((e) => onMapChange(e.transaction.origin));
  yText.observe((e) => {
    if (e.transaction.origin === LOCAL) return;
    const text = yText.toString();
    for (const l of sourceListeners) l(text);
  });
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE) return; // don't re-broadcast what we just received
    for (const l of updateListeners) l(update);
  });

  const overlay: OverlayDoc = {
    overrides: () => cache.overrides,
    groups: () => cache.groups,
    moveNode: (id, to: Point) => {
      const next = moveNode(cache.overrides, id, to);
      writeOverrides(next);
      cache = { overrides: next, groups: cache.groups };
    },
    resizeNode: (id, origin: Point, dim: Size) => {
      const next = resizeNode(cache.overrides, id, origin, dim);
      writeOverrides(next);
      cache = { overrides: next, groups: cache.groups };
    },
    clearOverrides: () => {
      const next: LayoutOverrides = new Map();
      writeOverrides(next);
      cache = { overrides: next, groups: cache.groups };
    },
    groupNodes: (units) => {
      const next = group(cache.groups, brand<string, "GroupId">(`g${groupSeq++}`), units);
      writeGroups(next);
      cache = { overrides: cache.overrides, groups: next };
    },
    ungroupAt: (top) => {
      const next = ungroup(cache.groups, top);
      writeGroups(next);
      cache = { overrides: cache.overrides, groups: next };
    },
    setGroupLocked: (top, locked) => {
      const next = setLocked(cache.groups, top, locked);
      writeGroups(next);
      cache = { overrides: cache.overrides, groups: next };
    },
    setGroupLabel: (id, label) => {
      const next = setGroupLabel(cache.groups, id, label);
      writeGroups(next);
      cache = { overrides: cache.overrides, groups: next };
    },
    pruneGroupsTo: (liveNodeIds) => {
      const next = pruneGroups(cache.groups, liveNodeIds);
      if (next === cache.groups) return false;
      writeGroups(next);
      cache = { overrides: cache.overrides, groups: next };
      return true;
    },
    replace: (overrides, groups) => {
      writeOverrides(overrides);
      writeGroups(groups);
      cache = { overrides, groups };
    },
    record: () => undoManager.stopCapturing(),
    undo: () => {
      if (!undoManager.canUndo()) return false;
      undoManager.undo();
      return true;
    },
    redo: () => {
      if (!undoManager.canRedo()) return false;
      undoManager.redo();
      return true;
    },
    clearHistory: () => undoManager.clear(),
    persist: () => opts.save(serializeOverlay(cache.overrides, cache.groups)),
  };

  return {
    overlay,
    source: () => yText.toString(),
    setSource: (text) => {
      doc.transact(() => {
        yText.delete(0, yText.length);
        if (text.length > 0) yText.insert(0, text);
      }, LOCAL);
    },
    spliceSource: (index, deleteCount, insert) => {
      doc.transact(() => {
        if (deleteCount > 0) yText.delete(index, deleteCount);
        if (insert.length > 0) yText.insert(index, insert);
      }, LOCAL);
    },
    onSourceChange: (listener) => {
      sourceListeners.add(listener);
      return () => sourceListeners.delete(listener);
    },
    onOverlayChange: (listener) => {
      overlayListeners.add(listener);
      return () => overlayListeners.delete(listener);
    },
    state: () => encodeStateAsUpdate(doc),
    applyUpdate: (update) => applyUpdate(doc, update, REMOTE),
    onUpdate: (listener) => {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },
    destroy: () => {
      undoManager.destroy();
      doc.destroy();
    },
  };
};
