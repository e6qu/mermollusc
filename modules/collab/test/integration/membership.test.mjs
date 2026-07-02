// Server-side membership source: strict JSON decoding + role resolution over verified users.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMembershipRoleResolver,
  decodeMemberships,
  loadMembershipRoleResolver,
} from "../../server/membership.mjs";

describe("membership source — decoding", () => {
  it("decodes a strict room -> subject -> role membership object", () => {
    const memberships = decodeMemberships({
      rooms: {
        "org_acme/claims": {
          "auth0|adjuster": "editor",
          "auth0|auditor": "viewer",
        },
      },
    });

    expect(memberships.get("org_acme/claims")?.get("auth0|adjuster")).toBe("editor");
    expect(memberships.get("org_acme/claims")?.get("auth0|auditor")).toBe("viewer");
  });

  it("rejects malformed membership data loudly", () => {
    expect(() => decodeMemberships({ rooms: { claims: { "auth0|u": "admin" } } })).toThrow(
      /invalid role/,
    );
    expect(() => decodeMemberships({ rooms: { claims: ["auth0|u"] } })).toThrow(
      /must be an object/,
    );
    expect(() => decodeMemberships({})).toThrow(/rooms object/);
  });
});

describe("membership source — role resolution", () => {
  it("grants the role listed for the verified subject", () => {
    const authorizeRoom = createMembershipRoleResolver({
      memberships: decodeMemberships({
        rooms: {
          "org_acme/claims": { "auth0|adjuster": "editor", "auth0|auditor": "viewer" },
        },
      }),
    });

    expect(
      authorizeRoom({
        user: { sub: "auth0|adjuster", tenant: "org_acme", roles: null },
        room: "org_acme/claims",
      }),
    ).toBe("editor");
    expect(
      authorizeRoom({
        user: { sub: "auth0|auditor", tenant: "org_acme", roles: null },
        room: "org_acme/claims",
      }),
    ).toBe("viewer");
  });

  it("fails closed for missing rooms or subjects when auth is enabled", () => {
    const authorizeRoom = createMembershipRoleResolver({
      memberships: decodeMemberships({ rooms: { claims: { "auth0|u": "owner" } } }),
      defaultRole: null,
    });

    expect(authorizeRoom({ user: { sub: "auth0|other", tenant: null, roles: null }, room: "claims" })).toBeNull();
    expect(authorizeRoom({ user: { sub: "auth0|u", tenant: null, roles: null }, room: "other" })).toBeNull();
  });

  it("keeps tenant isolation even if a cross-tenant membership exists", () => {
    const authorizeRoom = createMembershipRoleResolver({
      memberships: decodeMemberships({
        rooms: {
          "org_evil/claims": { "auth0|adjuster": "owner" },
        },
      }),
    });

    expect(
      authorizeRoom({
        user: { sub: "auth0|adjuster", tenant: "org_acme", roles: null },
        room: "org_evil/claims",
      }),
    ).toBeNull();
  });

  it("can preserve zero-auth dev access through an explicit default role", () => {
    const authorizeRoom = createMembershipRoleResolver({
      memberships: decodeMemberships({ rooms: {} }),
      defaultRole: "editor",
    });

    expect(authorizeRoom({ user: null, room: "playground" })).toBe("editor");
  });

  it("loads memberships from a JSON file", () => {
    const dir = mkdtempSync(join(tmpdir(), "collab-membership-"));
    const file = join(dir, "members.json");
    writeFileSync(file, JSON.stringify({ rooms: { board: { "auth0|owner": "owner" } } }));

    const authorizeRoom = loadMembershipRoleResolver(file);

    expect(authorizeRoom({ user: { sub: "auth0|owner", tenant: null, roles: null }, room: "board" })).toBe(
      "owner",
    );
  });
});
