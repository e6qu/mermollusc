// Server-side static membership source for relay RBAC. This is the first production-shaped membership
// seam: ops can mount a generated JSON file and the relay authorizes rooms from it instead of requiring
// per-room roles inside the OIDC token. The file is strict and loaded at startup; malformed membership
// data throws loudly before the relay accepts sockets.

import { readFileSync } from "node:fs";

const ROLES = new Set(["owner", "editor", "viewer"]);

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const assertRole = (role, path) => {
  if (!ROLES.has(role)) throw new Error(`membership ${path} has invalid role "${role}"`);
  return role;
};

export const decodeMemberships = (input) => {
  if (!isObject(input)) throw new Error("membership file must be a JSON object");
  if (!isObject(input.rooms)) throw new Error("membership file must contain a rooms object");
  const rooms = new Map();
  for (const [room, members] of Object.entries(input.rooms)) {
    if (room.length === 0) throw new Error("membership room id must not be empty");
    if (!isObject(members)) throw new Error(`membership room "${room}" must be an object`);
    const roomMembers = new Map();
    for (const [sub, role] of Object.entries(members)) {
      if (sub.length === 0) throw new Error(`membership room "${room}" has an empty subject`);
      roomMembers.set(sub, assertRole(role, `rooms.${room}.${sub}`));
    }
    rooms.set(room, roomMembers);
  }
  return rooms;
};

export const createMembershipRoleResolver = ({ memberships, defaultRole = null }) => ({ user, room }) => {
  if (user === null || user === undefined) return defaultRole;
  if (user.tenant !== null && user.tenant !== undefined && !room.startsWith(`${user.tenant}/`)) {
    return null;
  }
  const roomMembers = memberships.get(room);
  if (roomMembers === undefined) return defaultRole;
  return roomMembers.get(user.sub) ?? defaultRole;
};

export const loadMembershipRoleResolver = (path, opts = {}) => {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  return createMembershipRoleResolver({ memberships: decodeMemberships(parsed), ...opts });
};
