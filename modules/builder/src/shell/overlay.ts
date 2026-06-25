// Sanctioned boundary for the editor's sidecar overlay (manual positions + element groups). It is
// persisted as JSON (e.g. localStorage); on the way back in, untyped storage data enters only through
// `decode()` and leaves as branded `LayoutOverrides` / `Groups`, or a loud error.

import { brand, decode, type DecodeError, map, point, type Result, size } from "@m/std";
import type {
  EdgeStyle,
  EdgeStyles,
  Group,
  GroupMember,
  Groups,
  LayoutOverrides,
  NodeOverride,
  NodeStyle,
  NodeStyles,
} from "@m/contracts";
import { z } from "zod";

export interface Overlay {
  readonly overrides: LayoutOverrides;
  readonly groups: Groups;
  readonly edgeStyles: EdgeStyles;
  readonly nodeStyles: NodeStyles;
}

// `z.number()` already rejects NaN/Infinity; a size must additionally be non-negative — otherwise
// `length()` throws a RangeError *inside* the decoder (a tampered share-link/localStorage) instead of
// failing as a Result value.
const PointZ = z.object({ x: z.number(), y: z.number() });
const SizeZ = z.object({ width: z.number().nonnegative(), height: z.number().nonnegative() });
const OverrideZ = z.object({ position: PointZ, size: SizeZ.nullable(), pinned: z.boolean() });
const MemberZ = z.object({ kind: z.enum(["node", "group"]), id: z.string() });
const GroupZ = z.object({
  id: z.string(),
  label: z.string(),
  members: z.array(MemberZ),
  locked: z.boolean(),
});
const EdgeStyleZ = z.object({ curved: z.boolean() });
const NodeStyleZ = z.object({ accent: z.enum(["none", "muted", "active", "danger"]) });
const OverlayZ = z.object({
  overrides: z.array(z.tuple([z.string(), OverrideZ])),
  groups: z.array(z.tuple([z.string(), GroupZ])),
  // Optional on the wire so older share-links / persisted overlays (no styling) still decode.
  edgeStyles: z.array(z.tuple([z.string(), EdgeStyleZ])).default([]),
  nodeStyles: z.array(z.tuple([z.string(), NodeStyleZ])).default([]),
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

export const encodeEdgeStyleEntry = (s: EdgeStyle) =>
  ({ curved: s.curved }) satisfies Record<keyof EdgeStyle, unknown>;
export const encodeNodeStyleEntry = (s: NodeStyle) =>
  ({ accent: s.accent }) satisfies Record<keyof NodeStyle, unknown>;

// Serialise the overlay to a JSON string — branded values are plain numbers/strings on the wire.
export const serializeOverlay = (
  overrides: LayoutOverrides,
  groups: Groups,
  edgeStyles: EdgeStyles,
  nodeStyles: NodeStyles,
): string =>
  JSON.stringify({
    overrides: [...overrides].map(([id, o]) => [id, encodeOverrideEntry(o)]),
    groups: [...groups].map(([id, g]) => [id, encodeGroupEntry(g)]),
    edgeStyles: [...edgeStyles].map(([id, s]) => [id, encodeEdgeStyleEntry(s)]),
    nodeStyles: [...nodeStyles].map(([id, s]) => [id, encodeNodeStyleEntry(s)]),
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
    edgeStyles: new Map(
      j.edgeStyles.map(([id, s]) => [brand<string, "SceneEdgeId">(id), { curved: s.curved }]),
    ),
    nodeStyles: new Map(
      j.nodeStyles.map(([id, s]) => [brand<string, "SceneNodeId">(id), { accent: s.accent }]),
    ),
  }));
