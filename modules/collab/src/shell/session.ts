import {
  Array as YArray,
  Doc,
  Map as YMap,
  type Text as YText,
  UndoManager,
  applyUpdate,
  encodeStateAsUpdate,
} from "yjs";
import { yCollab } from "y-codemirror.next";
import {
  Awareness,
  applyAwarenessUpdate as applyAwareness,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";
import type { Extension } from "@codemirror/state";
import {
  decodeOverlay,
  encodeEdgeStyleEntry,
  encodeGroupEntry,
  encodeNodeStyleEntry,
  encodeOverrideEntry,
  group,
  moveNode,
  parentOf,
  pruneGroups,
  resizeNode,
  serializeOverlay,
  setGroupLabel,
  setLocked,
  ungroup,
} from "@m/builder";
import type {
  EdgeStyles,
  Group,
  Groups,
  LayoutOverrides,
  NodeStyles,
  OverlayDoc,
} from "@m/contracts";
import {
  brand,
  type DecodeError,
  isErr,
  type Logger,
  type Point,
  type Result,
  type Size,
  stamp,
} from "@m/std";

// A collaborative document: the diagram **source text** (a `Y.Text`) and the sidecar **overlay**
// (overrides + groups + visual styles, in four `Y.Map`s) share one `Y.Doc`, so concurrent edits merge
// as a CRDT. The rendered diagram is *not* shared — each client re-derives it locally from the merged
// source+overlay (see docs/collab-editor-plan.md §4), keeping the doc tiny and conflict-free.
//
// `overlay` satisfies the same `OverlayDoc` port as the local single-user document, so the app swaps
// one for the other without touching call sites. Transport is left to the caller: `state`/`applyUpdate`
// /`onUpdate` are the binary-sync seam a WebSocket server (or an in-memory test) wires together.
// Closed event union for this module's structured logging (the @m/std `Logger` contract). The core
// never logs; the shell logs loudly at the boundaries where peer data is decoded
// (`overlay-decode-rejected`, `control-rejected` — see the transport) and where the relay permanently
// rejects a connection (`relay-rejected`).
export type CollabEvent = "overlay-decode-rejected" | "control-rejected" | "relay-rejected";

// A surfaced session-health status the app can show. `synced` is the healthy steady state; a corrupt
// remote overlay that fails to decode drops us to `overlay-rejected` (last-good state is retained, the
// bad update is ignored) so the UI can warn instead of the session silently diverging.
export type CollabStatus = "synced" | "overlay-rejected";

export interface CollabSession {
  readonly overlay: OverlayDoc;

  source(): string;
  setSource(text: string): void;
  // Atomically seed the source only if it is still empty, in one transaction (no check-then-set gap).
  // Returns whether it seeded. The first client into an empty room fills it; a client that has already
  // synced non-empty content skips. (Two genuinely-simultaneous fresh clients can still both seed —
  // that needs server-side coordination, a later phase.)
  seedSourceIfEmpty(text: string): boolean;
  // Character-level edit (the CRDT-friendly path: concurrent splices at different offsets both survive).
  spliceSource(index: number, deleteCount: number, insert: string): void;
  // A CodeMirror extension that two-way-binds the editor to the source `Y.Text` (y-codemirror.next):
  // local keystrokes flow into the CRDT and remote edits into the editor, merged at the character
  // level, with per-user text undo. The `Y.Text` stays encapsulated — only an opaque extension crosses
  // the boundary. Add it to a CodeMirror `EditorState` (the app wires it through `createEditor`).
  sourceBinding(): Extension;
  // Fires on *remote* source changes only (local edits don't echo back). Returns an unsubscribe fn.
  onSourceChange(listener: (text: string) => void): () => void;
  // Fires on *remote* / undo-driven overlay changes (local mutations update synchronously in place).
  onOverlayChange(listener: () => void): () => void;
  // Fires when the session health status changes (e.g. a remote overlay failed to decode and was
  // dropped, keeping last-good state). The app surfaces this to the user. Returns an unsubscribe fn.
  onStatusChange(listener: (status: CollabStatus) => void): () => void;

  // Presence (awareness). `setLocalUser` labels this client (the colour/name remote cursors show).
  // The local text cursor is tracked into awareness automatically by the source binding.
  setLocalUser(user: { readonly name: string; readonly color: string }): void;

  // Binary sync seam. `state`/`awarenessState` are the whole-document / whole-presence updates for a
  // joining peer; `applyUpdate`/`applyAwarenessUpdate` integrate a peer's; `onUpdate`/`onAwarenessUpdate`
  // emit this client's *own* updates to broadcast (applied remote updates are not re-emitted, so a relay
  // can't loop). Document and presence travel as distinct frames (see the transport).
  state(): Uint8Array;
  applyUpdate(update: Uint8Array): void;
  onUpdate(listener: (update: Uint8Array) => void): () => void;
  awarenessState(): Uint8Array;
  applyAwarenessUpdate(update: Uint8Array): void;
  onAwarenessUpdate(listener: (update: Uint8Array) => void): () => void;

  destroy(): void;
}

// Yjs transaction origins. Local edits are tracked for undo and broadcast; applied remote updates are
// neither re-broadcast nor (re)materialised redundantly; the initial seed is excluded from history.
const LOCAL = Symbol("collab/local");
const REMOTE = Symbol("collab/remote");
const SEED = Symbol("collab/seed");

// Each override is one Y.Map value (CRDT merges per-entry), encoded through the builder's shared
// per-entry encoder — the same source of truth as JSON persistence, so the wire shape can't drift and a
// newly-added domain field is a compile error there rather than a silent drop.
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// A group's wire-shaped member (see `encodeGroupEntry`), as it lives inside a group's nested `members`
// Y.Array.
type EncodedMember = { readonly kind: "node" | "group"; readonly id: string };
const memberKey = (m: { readonly kind: string; readonly id: string }): string =>
  `${m.kind}:${m.id}`;

// A group is a nested Y.Map (`id`/`label`/`locked` fields + a nested `members` Y.Array), NOT one flat
// value — so two peers editing *different members of the same group* concurrently both survive (each
// insert/delete on the members Y.Array is its own CRDT op), instead of one whole-group write clobbering
// the other's. `label`/`locked` stay per-field LWW within the group's own Y.Map. JSON persistence is
// unaffected: `encodeGroupEntry`/`decodeOverlay` still speak the flat `{id,label,members,locked}` shape;
// only the *live* Yjs container differs, flattened back via `.toJSON()` in `materialize()`.
const buildGroupType = (g: Group): YMap<unknown> => {
  const enc = encodeGroupEntry(g);
  const yGroup = new YMap<unknown>();
  yGroup.set("id", enc.id);
  yGroup.set("label", enc.label);
  yGroup.set("locked", enc.locked);
  const yMembers = new YArray<EncodedMember>();
  if (enc.members.length > 0) yMembers.push(enc.members);
  yGroup.set("members", yMembers);
  return yGroup;
};
// The value type of a group's own Y.Map is heterogeneous (string/boolean/nested Y.Array), so reading
// its `members` field back out needs a narrowing cast — the Yjs-adapter equivalent of `decode()` at a
// boundary whose shape this module itself defined and controls (see `buildGroupType` above). The
// container shape is validated (a corrupt remote value could put anything at "members"); only the
// element type remains asserted, matching what `buildGroupType` writes.
const groupMembers = (yGroup: YMap<unknown>): YArray<EncodedMember> | null => {
  const raw = yGroup.get("members");
  return raw instanceof YArray ? (raw as YArray<EncodedMember>) : null;
};

export const createCollabSession = (opts: {
  readonly initialOverrides: LayoutOverrides;
  readonly initialGroups: Groups;
  readonly initialSource: string;
  readonly initialEdgeStyles?: EdgeStyles;
  readonly initialNodeStyles?: NodeStyles;
  readonly initialUpdate?: Uint8Array | undefined;
  readonly save: (serialized: string) => void;
  // Loud-logging sink for boundary failures (a corrupt remote overlay). Omitted in tests that don't
  // assert on logs; the app passes the @m/std `consoleLogger`.
  readonly logger?: Logger<CollabEvent>;
}): CollabSession => {
  const doc = new Doc();
  const yText: YText = doc.getText("source");
  const yOverrides: YMap<unknown> = doc.getMap("overrides");
  const yGroups: YMap<YMap<unknown>> = doc.getMap("groups");
  // Visual overlay styles sync exactly like positions/groups do — per-entry Y.Map values through the
  // builder's shared wire encoders, so a peer's restyle (a coloured node, a curved edge) is seen by
  // everyone, not held in per-client session memory.
  const yEdgeStyles: YMap<unknown> = doc.getMap("edgeStyles");
  const yNodeStyles: YMap<unknown> = doc.getMap("nodeStyles");
  // Presence is ephemeral and travels on its own frame (see the transport), so the awareness origin is
  // distinct from the doc origins — applied remote presence isn't re-broadcast.
  const awareness = new Awareness(doc);
  const AWARE_REMOTE = Symbol("collab/aware-remote");

  // Local materialised view (branded). Local mutations update it synchronously; remote/undo changes
  // rebuild it from the Y.Maps through the shared Zod decoder, so peer data crosses the boundary
  // validated — never trusted raw.
  interface OverlayCache {
    overrides: LayoutOverrides;
    groups: Groups;
    edgeStyles: EdgeStyles;
    nodeStyles: NodeStyles;
  }
  let cache: OverlayCache = {
    overrides: opts.initialOverrides,
    groups: opts.initialGroups,
    edgeStyles: opts.initialEdgeStyles ?? new Map(),
    nodeStyles: opts.initialNodeStyles ?? new Map(),
  };
  // Mints fresh group ids; monotonic for the document's lifetime.
  let groupSeq = 0;

  // Materialise the branded view from the Y.Maps through the shared Zod decoder. Pure: it RETURNS the
  // decode Result (never throws), so the caller — a Yjs observer running on a remote update — can keep
  // last-good state and surface the failure rather than the throw escaping the observer and crashing.
  const materialize = (): Result<OverlayCache, DecodeError> => {
    const overrides: Array<[string, unknown]> = [];
    yOverrides.forEach((v, k) => {
      overrides.push([k, v]);
    });
    const groups: Array<[string, unknown]> = [];
    // A group value that isn't the nested Y.Map this session writes (a stale pre-redesign flat value,
    // or a malicious peer's substitute) can't be flattened — push `null` so the shared decoder rejects
    // it as malformed, same as any other corrupt entry, rather than throwing here on a missing
    // `.toJSON`.
    yGroups.forEach((v, k) => {
      groups.push([k, v instanceof YMap ? v.toJSON() : null]);
    });
    const edgeStyles: Array<[string, unknown]> = [];
    yEdgeStyles.forEach((v, k) => {
      edgeStyles.push([k, v]);
    });
    const nodeStyles: Array<[string, unknown]> = [];
    yNodeStyles.forEach((v, k) => {
      nodeStyles.push([k, v]);
    });
    return decodeOverlay({ overrides, groups, edgeStyles, nodeStyles });
  };

  const writeOverrides = (next: LayoutOverrides): void => {
    doc.transact(() => {
      for (const [id, o] of next) {
        const enc = encodeOverrideEntry(o);
        if (!sameJson(yOverrides.get(id), enc)) yOverrides.set(id, enc);
      }
      for (const k of [...yOverrides.keys()])
        if (!next.has(brand<string, "SceneNodeId">(k))) yOverrides.delete(k);
    }, LOCAL);
  };

  // Seed the shared doc with the caller's starting state, outside undo history. A stored Yjs snapshot
  // is already the whole room state, so it wins over source/overlay seeds.
  if (opts.initialUpdate !== undefined) {
    applyUpdate(doc, opts.initialUpdate, REMOTE);
    const decoded = materialize();
    if (isErr(decoded)) {
      throw new Error(`collab initial snapshot rejected: ${decoded.error.issues.join("; ")}`);
    }
    cache = decoded.value;
  } else {
    doc.transact(() => {
      if (opts.initialSource.length > 0) yText.insert(0, opts.initialSource);
      for (const [id, o] of opts.initialOverrides) yOverrides.set(id, encodeOverrideEntry(o));
      for (const [id, g] of opts.initialGroups) yGroups.set(id, buildGroupType(g));
      for (const [id, s] of cache.edgeStyles) yEdgeStyles.set(id, encodeEdgeStyleEntry(s));
      for (const [id, s] of cache.nodeStyles) yNodeStyles.set(id, encodeNodeStyleEntry(s));
    }, SEED);
  }

  const undoManager = new UndoManager([yOverrides, yGroups, yEdgeStyles, yNodeStyles], {
    trackedOrigins: new Set([LOCAL]),
  });

  const overlayListeners = new Set<() => void>();
  const sourceListeners = new Set<(text: string) => void>();
  const updateListeners = new Set<(update: Uint8Array) => void>();
  const statusListeners = new Set<(status: CollabStatus) => void>();
  let status: CollabStatus = "synced";

  const notifyOverlay = (): void => {
    for (const l of overlayListeners) l();
  };
  const setStatus = (next: CollabStatus): void => {
    if (status === next) return;
    status = next;
    for (const l of statusListeners) l(next);
  };

  // Remote or undo/redo edits (origin ≠ LOCAL) rebuild the cache from the Y.Maps; local edits already
  // set `cache` in place, so re-materialising them would be wasted work. The rebuild can fail if a peer
  // sent a corrupt overlay (decode rejects); rather than throw out of this Yjs observer (which would
  // crash the session), we log loudly, surface a status, and KEEP last-good `cache` — so a malicious or
  // buggy peer degrades to a warning, not a desync.
  const onMapChange = (origin: unknown): void => {
    if (origin === LOCAL) return;
    const decoded = materialize();
    if (isErr(decoded)) {
      opts.logger?.log(stamp("error", "collab", "overlay-decode-rejected"));
      setStatus("overlay-rejected");
      return;
    }
    cache = decoded.value;
    setStatus("synced");
    notifyOverlay();
  };
  // Named so `destroy()` can detach them — `Y.Doc.destroy()` does not remove type observers, so leaving
  // these bound would leak the session (and its captured listener Sets) for any retained doc reference.
  const onOverridesChange = (e: { transaction: { origin: unknown } }): void =>
    onMapChange(e.transaction.origin);
  // Deep: group mutations now include nested-array member edits (see `buildGroupType`), which a shallow
  // `observe` on `yGroups` itself would miss — only `observeDeep` sees changes inside a group's already-
  // integrated nested Y.Map/Y.Array.
  const onGroupsChange = (_events: unknown, transaction: { origin: unknown }): void =>
    onMapChange(transaction.origin);
  const onStylesChange = (e: { transaction: { origin: unknown } }): void =>
    onMapChange(e.transaction.origin);
  const onTextChange = (e: { transaction: { origin: unknown } }): void => {
    if (e.transaction.origin === LOCAL) return;
    const text = yText.toString();
    for (const l of sourceListeners) l(text);
  };
  const onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === REMOTE) return; // don't re-broadcast what we just received
    for (const l of updateListeners) l(update);
  };
  yOverrides.observe(onOverridesChange);
  yGroups.observeDeep(onGroupsChange);
  yEdgeStyles.observe(onStylesChange);
  yNodeStyles.observe(onStylesChange);
  yText.observe(onTextChange);
  doc.on("update", onDocUpdate);

  const overlay: OverlayDoc = {
    overrides: () => cache.overrides,
    groups: () => cache.groups,
    edgeStyles: () => cache.edgeStyles,
    nodeStyles: () => cache.nodeStyles,
    setEdgeStyle: (id, style) => {
      const next = new Map(cache.edgeStyles);
      if (style === null) next.delete(id);
      else next.set(id, style);
      doc.transact(() => {
        if (style === null) yEdgeStyles.delete(id);
        else {
          const enc = encodeEdgeStyleEntry(style);
          if (!sameJson(yEdgeStyles.get(id), enc)) yEdgeStyles.set(id, enc);
        }
      }, LOCAL);
      cache = { ...cache, edgeStyles: next };
      notifyOverlay();
    },
    setNodeStyle: (id, style) => {
      const next = new Map(cache.nodeStyles);
      if (style === null) next.delete(id);
      else next.set(id, style);
      doc.transact(() => {
        if (style === null) yNodeStyles.delete(id);
        else {
          const enc = encodeNodeStyleEntry(style);
          if (!sameJson(yNodeStyles.get(id), enc)) yNodeStyles.set(id, enc);
        }
      }, LOCAL);
      cache = { ...cache, nodeStyles: next };
      notifyOverlay();
    },
    moveNode: (id, to: Point) => {
      const next = moveNode(cache.overrides, id, to);
      writeOverrides(next);
      cache = { ...cache, overrides: next };
    },
    resizeNode: (id, origin: Point, dim: Size) => {
      const next = resizeNode(cache.overrides, id, origin, dim);
      writeOverrides(next);
      cache = { ...cache, overrides: next };
    },
    clearOverrides: () => {
      const next: LayoutOverrides = new Map();
      writeOverrides(next);
      cache = { ...cache, overrides: next };
    },
    replaceOverrides: (overrides) => {
      writeOverrides(overrides);
      cache = { ...cache, overrides };
    },
    groupNodes: (units) => {
      // Namespace the minted id with this client's awareness clientID so two collaborators grouping at
      // the same moment can't both mint `g0` and overwrite each other in the shared map. The decoder
      // accepts any `z.string()`, and no consumer parses the suffix numerically, so the richer id is a
      // drop-in.
      const id = brand<string, "GroupId">(`g${awareness.clientID}-${groupSeq++}`);
      const next = group(cache.groups, id, units);
      const g = next.get(id);
      if (g !== undefined) {
        doc.transact(() => {
          yGroups.set(id, buildGroupType(g));
        }, LOCAL);
      }
      cache = { ...cache, groups: next };
    },
    ungroupAt: (top) => {
      const dissolved = cache.groups.get(top);
      if (dissolved === undefined) return; // nothing to dissolve — matches the pure core's no-op
      const parent = parentOf(cache.groups, { kind: "group", id: top });
      const next = ungroup(cache.groups, top);
      doc.transact(() => {
        yGroups.delete(top);
        if (parent === null) return;
        const yParent = yGroups.get(parent);
        if (yParent === undefined) return;
        // Splice the freed members in at the dissolved group's own position in the parent's members
        // Y.Array — a targeted list-CRDT op, so a peer concurrently splicing a *different* dissolved
        // (or otherwise edited) member elsewhere in the same parent isn't clobbered by a whole-group
        // rewrite.
        const yMembers = groupMembers(yParent);
        if (yMembers === null) {
          // A corrupt remote value at "members" — degrade loudly, keep last-good state (same policy as
          // the overlay decode guard).
          opts.logger?.log(stamp("error", "collab", "overlay-decode-rejected"));
          return;
        }
        const idx = yMembers.toArray().findIndex((m) => m.kind === "group" && m.id === top);
        if (idx === -1) return;
        yMembers.delete(idx, 1);
        const freed = encodeGroupEntry(dissolved).members;
        if (freed.length > 0) yMembers.insert(idx, freed);
      }, LOCAL);
      cache = { ...cache, groups: next };
    },
    setGroupLocked: (top, locked) => {
      const next = setLocked(cache.groups, top, locked);
      if (next === cache.groups) return;
      doc.transact(() => {
        yGroups.get(top)?.set("locked", locked);
      }, LOCAL);
      cache = { ...cache, groups: next };
    },
    setGroupLabel: (id, label) => {
      const next = setGroupLabel(cache.groups, id, label);
      if (next === cache.groups) return;
      doc.transact(() => {
        yGroups.get(id)?.set("label", label);
      }, LOCAL);
      cache = { ...cache, groups: next };
    },
    pruneGroupsTo: (liveNodeIds) => {
      const next = pruneGroups(cache.groups, liveNodeIds);
      if (next === cache.groups) return false;
      doc.transact(() => {
        // `pruneGroups` only ever shrinks membership, so the write-side only ever needs to *delete*
        // vanished entries (dead node members, or a member group that itself pruned away to nothing) —
        // never reorder or insert, which keeps this a set of targeted per-member removals rather than a
        // whole-group rewrite.
        for (const key of [...yGroups.keys()]) {
          const survivor = next.get(brand<string, "GroupId">(key));
          if (survivor === undefined) {
            yGroups.delete(key);
            continue;
          }
          const yGroup = yGroups.get(key);
          if (yGroup === undefined) continue;
          const keep = new Set(survivor.members.map(memberKey));
          const yMembers = groupMembers(yGroup);
          if (yMembers === null) {
            opts.logger?.log(stamp("error", "collab", "overlay-decode-rejected"));
            continue;
          }
          const current = yMembers.toArray();
          for (let i = current.length - 1; i >= 0; i--) {
            const cur = current[i];
            if (cur !== undefined && !keep.has(memberKey(cur))) yMembers.delete(i, 1);
          }
        }
      }, LOCAL);
      cache = { ...cache, groups: next };
      return true;
    },
    replace: (overrides, groups, edgeStyles, nodeStyles) => {
      writeOverrides(overrides);
      doc.transact(() => {
        for (const key of [...yGroups.keys()]) yGroups.delete(key);
        for (const [id, g] of groups) yGroups.set(id, buildGroupType(g));
        for (const key of [...yEdgeStyles.keys()]) {
          if (!edgeStyles.has(brand<string, "SceneEdgeId">(key))) yEdgeStyles.delete(key);
        }
        for (const [id, s] of edgeStyles) {
          const enc = encodeEdgeStyleEntry(s);
          if (!sameJson(yEdgeStyles.get(id), enc)) yEdgeStyles.set(id, enc);
        }
        for (const key of [...yNodeStyles.keys()]) {
          if (!nodeStyles.has(brand<string, "SceneNodeId">(key))) yNodeStyles.delete(key);
        }
        for (const [id, s] of nodeStyles) {
          const enc = encodeNodeStyleEntry(s);
          if (!sameJson(yNodeStyles.get(id), enc)) yNodeStyles.set(id, enc);
        }
      }, LOCAL);
      cache = { overrides, groups, edgeStyles, nodeStyles };
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
    canUndo: () => undoManager.canUndo(),
    canRedo: () => undoManager.canRedo(),
    clearHistory: () => undoManager.clear(),
    persist: () =>
      opts.save(
        serializeOverlay(cache.overrides, cache.groups, cache.edgeStyles, cache.nodeStyles),
      ),
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
    seedSourceIfEmpty: (text) => {
      let seeded = false;
      doc.transact(() => {
        if (yText.length === 0 && text.length > 0) {
          yText.insert(0, text);
          seeded = true;
        }
      }, LOCAL);
      return seeded;
    },
    spliceSource: (index, deleteCount, insert) => {
      doc.transact(() => {
        if (deleteCount > 0) yText.delete(index, deleteCount);
        if (insert.length > 0) yText.insert(index, insert);
      }, LOCAL);
    },
    sourceBinding: () => yCollab(yText, awareness),
    onSourceChange: (listener) => {
      sourceListeners.add(listener);
      return () => sourceListeners.delete(listener);
    },
    onOverlayChange: (listener) => {
      overlayListeners.add(listener);
      return () => overlayListeners.delete(listener);
    },
    onStatusChange: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    setLocalUser: (user) =>
      awareness.setLocalStateField("user", { name: user.name, color: user.color }),
    state: () => encodeStateAsUpdate(doc),
    applyUpdate: (update) => applyUpdate(doc, update, REMOTE),
    onUpdate: (listener) => {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },
    awarenessState: () => encodeAwarenessUpdate(awareness, [awareness.clientID]),
    applyAwarenessUpdate: (update) => applyAwareness(awareness, update, AWARE_REMOTE),
    onAwarenessUpdate: (listener) => {
      const handler = (
        changes: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ): void => {
        if (origin === AWARE_REMOTE) return; // don't re-broadcast presence we just received
        const changed = [...changes.added, ...changes.updated, ...changes.removed];
        listener(encodeAwarenessUpdate(awareness, changed));
      };
      awareness.on("update", handler);
      return () => awareness.off("update", handler);
    },
    destroy: () => {
      yOverrides.unobserve(onOverridesChange);
      yGroups.unobserveDeep(onGroupsChange);
      yEdgeStyles.unobserve(onStylesChange);
      yNodeStyles.unobserve(onStylesChange);
      yText.unobserve(onTextChange);
      doc.off("update", onDocUpdate);
      overlayListeners.clear();
      sourceListeners.clear();
      updateListeners.clear();
      statusListeners.clear();
      awareness.destroy();
      undoManager.destroy();
      doc.destroy();
    },
  };
};
