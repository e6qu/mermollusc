import type { Point, Size } from "@m/std";
import type { GroupId, GroupMember, Groups } from "./groups.js";
import type { EdgeStyle, EdgeStyles, LayoutOverrides, NodeStyle, NodeStyles } from "./overrides.js";
import type { SceneEdgeId, SceneNodeId } from "./scene.js";

// The port the app drives the sidecar overlay through: manual node positions/sizes (`overrides`) plus
// element groups (`groups`), with undo/redo history and persistence. It is the single owner of that
// state, so call sites never touch the underlying maps directly.
//
// Two implementations satisfy it: the local, single-user one in the app (`createLocalDocument`) and a
// Yjs-backed collaborative one in `@m/collab` whose edits sync to peers. Because both expose the same
// interface, swapping local ↔ collaborative changes how the overlay propagates, not any call site.
//
// Mutations don't persist or record history on their own — the caller drives `record()` (once per
// gesture) and `persist()` (e.g. on pointer-up), so a multi-node drag is a single history entry and a
// single save, the same way a hand edit behaves.
export interface OverlayDoc {
  overrides(): LayoutOverrides;
  groups(): Groups;
  edgeStyles(): EdgeStyles;
  nodeStyles(): NodeStyles;

  moveNode(id: SceneNodeId, to: Point): void;
  // Set a presentation-only style (null clears it). Visual overlay layers — no source edit.
  setEdgeStyle(id: SceneEdgeId, style: EdgeStyle | null): void;
  setNodeStyle(id: SceneNodeId, style: NodeStyle | null): void;
  resizeNode(id: SceneNodeId, origin: Point, dim: Size): void;
  clearOverrides(): void;
  replaceOverrides(overrides: LayoutOverrides): void;
  groupNodes(units: readonly GroupMember[]): void;
  ungroupAt(top: GroupId): void;
  setGroupLocked(top: GroupId, locked: boolean): void;
  setGroupLabel(id: GroupId, label: string): void;
  // Drop groups whose member nodes the edited text removed; returns whether anything changed.
  pruneGroupsTo(liveNodeIds: ReadonlySet<SceneNodeId>): boolean;
  replace(
    overrides: LayoutOverrides,
    groups: Groups,
    edgeStyles: EdgeStyles,
    nodeStyles: NodeStyles,
  ): void;

  record(): void;
  undo(): boolean;
  redo(): boolean;
  clearHistory(): void;

  persist(): void;
}
