// Per-document RBAC + tenant isolation for room admission. Given a verified `user` and a `room`,
// `authorizeRoom({ user, room })` returns the role (owner | editor | viewer) or null (no access). The
// default resolver is stateless — it reads per-room roles from the user's token claims and isolates
// tenants by a room-name prefix (`<tenant>/<id>`). A future server-side membership store replaces it
// behind the same signature, without touching the relay.
//
// Plain ESM (server-side, outside src/).

const ROLES = new Set(["owner", "editor", "viewer"]);

// `defaultRole` is the role granted to an authenticated user whose token carries no per-room roles
// claim. It defaults to `"editor"` (dev-friendly: any authenticated org member can edit), but is an
// EXPLICIT knob — a production deployment with a real membership source should pass `null` to
// fail *closed* (no claim → no access) instead of fail-open. See BUGS.md.
export const createClaimsRoleResolver = ({ defaultRole = "editor" } = {}) => ({ user, room }) => {
  // No authenticated user (auth disabled / local dev) → full access. RBAC only bites when auth is on.
  if (user === null || user === undefined) return "editor";

  // Tenant isolation: a tenant-bound user reaches only rooms namespaced to their tenant (`<tenant>/…`).
  if (user.tenant !== null && user.tenant !== undefined) {
    if (!room.startsWith(`${user.tenant}/`)) return null;
  }

  // Role: the per-room roles claim is authoritative when present (deny rooms it doesn't list). With no
  // roles claim at all, fall back to `defaultRole`. The claim may key by full room id (`<tenant>/<id>`)
  // or the bare id.
  if (user.roles === null || user.roles === undefined) return defaultRole;
  const bare = room.includes("/") ? room.slice(room.indexOf("/") + 1) : room;
  const role = user.roles[room] ?? user.roles[bare] ?? null;
  return ROLES.has(role) ? role : null;
};

export const canWrite = (role) => role === "owner" || role === "editor";
