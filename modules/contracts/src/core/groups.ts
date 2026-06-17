// Sidecar element-grouping layer, alongside the position overrides. Editor-only (never in the
// diagram text), family-agnostic, and arbitrarily nestable: a group's `members` are scene nodes
// and/or other groups, kept in a stable order so unbundling restores them where they were.

import type { Brand } from "@m/std";
import type { SceneNodeId } from "./scene.js";

export type GroupId = Brand<string, "GroupId">;

// A member is tagged so a node and a group that happen to share an id string can't be confused.
export type GroupMember =
  | { readonly kind: "node"; readonly id: SceneNodeId }
  | { readonly kind: "group"; readonly id: GroupId };

export interface Group {
  readonly id: GroupId;
  readonly members: readonly GroupMember[];
  // A locked group cannot be dragged (move-only lock); its members can still be edited/deleted.
  readonly locked: boolean;
}

export type Groups = ReadonlyMap<GroupId, Group>;
