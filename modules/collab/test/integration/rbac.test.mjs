// RBAC resolver: roles from token claims + tenant isolation by room prefix. Pure over a `user` object,
// so no tokens/sockets needed. Plain ESM, run by vitest.

import { describe, expect, it } from "vitest";
import { canWrite, createClaimsRoleResolver } from "../../server/rbac.mjs";

const authorizeRoom = createClaimsRoleResolver();

describe("RBAC — role resolution", () => {
  it("grants full access to an unauthenticated user (auth off / local dev)", () => {
    expect(authorizeRoom({ user: null, room: "playground" })).toBe("editor");
  });

  it("defaults an authenticated user with no roles claim to editor", () => {
    const user = { sub: "u", tenant: null, roles: null };
    expect(authorizeRoom({ user, room: "anything" })).toBe("editor");
  });

  it("returns the per-room role from the claim (by full id or bare id)", () => {
    const user = { sub: "u", tenant: null, roles: { "acme/board1": "viewer", board2: "owner" } };
    expect(authorizeRoom({ user, room: "acme/board1" })).toBe("viewer");
    expect(authorizeRoom({ user, room: "board2" })).toBe("owner");
  });

  it("denies a room the roles claim doesn't list (when a claim is present)", () => {
    const user = { sub: "u", tenant: null, roles: { board1: "editor" } };
    expect(authorizeRoom({ user, room: "board9" })).toBeNull();
  });

  it("rejects an unknown role value", () => {
    const user = { sub: "u", tenant: null, roles: { board1: "superadmin" } };
    expect(authorizeRoom({ user, room: "board1" })).toBeNull();
  });
});

describe("RBAC — tenant isolation", () => {
  it("admits a room namespaced to the user's tenant", () => {
    const user = { sub: "u", tenant: "org_acme", roles: { "org_acme/board1": "editor" } };
    expect(authorizeRoom({ user, room: "org_acme/board1" })).toBe("editor");
  });

  it("denies a room in another tenant, even with a matching role key", () => {
    const user = { sub: "u", tenant: "org_acme", roles: { "org_evil/board1": "owner" } };
    expect(authorizeRoom({ user, room: "org_evil/board1" })).toBeNull();
  });
});

describe("RBAC — canWrite", () => {
  it("owner and editor can write; viewer cannot", () => {
    expect(canWrite("owner")).toBe(true);
    expect(canWrite("editor")).toBe(true);
    expect(canWrite("viewer")).toBe(false);
    expect(canWrite(null)).toBe(false);
  });
});
