// Sanctioned boundary for the editor's sidecar overlay (manual positions + element groups). It is
// persisted as JSON (e.g. localStorage); on the way back in, untyped storage data enters only through
// `decode()` and leaves as branded `LayoutOverrides` / `Groups`, or a loud error.

import { brand, decode, type DecodeError, map, point, type Result, size } from "@m/std";
import type { Group, GroupMember, Groups, LayoutOverrides, NodeOverride } from "@m/contracts";
import { z } from "zod";

export interface Overlay {
  readonly overrides: LayoutOverrides;
  readonly groups: Groups;
}

const PointZ = z.object({ x: z.number(), y: z.number() });
const SizeZ = z.object({ width: z.number(), height: z.number() });
const OverrideZ = z.object({ position: PointZ, size: SizeZ.nullable(), pinned: z.boolean() });
const MemberZ = z.object({ kind: z.enum(["node", "group"]), id: z.string() });
const GroupZ = z.object({
  id: z.string(),
  label: z.string(),
  members: z.array(MemberZ),
  locked: z.boolean(),
});
const OverlayZ = z.object({
  overrides: z.array(z.tuple([z.string(), OverrideZ])),
  groups: z.array(z.tuple([z.string(), GroupZ])),
});

// Per-entry wire encoders, branded values flattened to plain numbers/strings. The
// `satisfies Record<keyof …, unknown>` turns a newly-added domain field into a compile error here (the
// literal would be missing that key), so a field can never be *silently* dropped on the wire. These are
// the single source of truth for the overlay's on-the-wire shape — JSON persistence below and the collab
// Y.Map sync both encode through them, so the two can't drift.
export const encodeOverrideEntry = (o: NodeOverride) =>
  ({
    position: { x: o.position.x, y: o.position.y },
    size: o.size === null ? null : { width: o.size.width, height: o.size.height },
    pinned: o.pinned,
  }) satisfies Record<keyof NodeOverride, unknown>;

export const encodeGroupEntry = (g: Group) =>
  ({
    id: g.id,
    label: g.label,
    members: g.members.map((m) => ({ kind: m.kind, id: m.id })),
    locked: g.locked,
  }) satisfies Record<keyof Group, unknown>;

// Serialise the overlay to a JSON string — branded values are plain numbers/strings on the wire.
export const serializeOverlay = (overrides: LayoutOverrides, groups: Groups): string =>
  JSON.stringify({
    overrides: [...overrides].map(([id, o]) => [id, encodeOverrideEntry(o)]),
    groups: [...groups].map(([id, g]) => [id, encodeGroupEntry(g)]),
  });

// Decode an untyped overlay payload (e.g. `JSON.parse(localStorage…)`) back into branded maps.
export const decodeOverlay = (input: unknown): Result<Overlay, DecodeError> =>
  map(decode(OverlayZ, input), (j) => ({
    overrides: new Map(
      j.overrides.map(([id, o]) => [
        brand<string, "SceneNodeId">(id),
        {
          position: point(o.position.x, o.position.y),
          size: o.size === null ? null : size(o.size.width, o.size.height),
          pinned: o.pinned,
        },
      ]),
    ),
    groups: new Map(
      j.groups.map(([id, g]) => [
        brand<string, "GroupId">(id),
        {
          id: brand<string, "GroupId">(g.id),
          label: g.label,
          members: g.members.map(
            (m): GroupMember =>
              m.kind === "node"
                ? { kind: "node", id: brand<string, "SceneNodeId">(m.id) }
                : { kind: "group", id: brand<string, "GroupId">(m.id) },
          ),
          locked: g.locked,
        },
      ]),
    ),
  }));
