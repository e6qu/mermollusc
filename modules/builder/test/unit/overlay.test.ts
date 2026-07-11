import { brand, isOk, point, size } from "@m/std";
import type { Groups, LayoutOverrides } from "@m/contracts";
import { describe, expect, it } from "vitest";
import {
  decodeOverlay,
  encodeEdgeStyleEntry,
  encodeGroupEntry,
  encodeNodeStyleEntry,
  encodeOverrideEntry,
  serializeOverlay,
} from "../../src/shell/overlay.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const gid = (s: string) => brand<string, "GroupId">(s);

describe("overlay codec", () => {
  it("round-trips overrides and (nested, locked) groups through serialize → decode", () => {
    const overrides: LayoutOverrides = new Map([
      [snid("A"), { position: point(10, 20), size: null, pinned: true }],
      [snid("B"), { position: point(30, 40), size: size(60, 24), pinned: true }],
    ]);
    const groups: Groups = new Map([
      [
        gid("g1"),
        {
          id: gid("g1"),
          label: "Backend",
          members: [
            { kind: "node", id: snid("A") },
            { kind: "group", id: gid("g0") },
          ],
          locked: true,
        },
      ],
    ]);

    const edgeStyles = new Map([
      [
        brand<string, "SceneEdgeId">("e0"),
        { route: "curved" as const, routeOption: null, labelT: 0.7, waypoints: null, accent: "network" as const },
      ],
    ]);
    // An architecture accent (compute…ops) must survive the round-trip — the decoder used to allow only
    // the four generic ones, which silently dropped a saved architecture colour.
    const nodeStyles = new Map([[snid("A"), { accent: "compute" as const }]]);
    const decoded = decodeOverlay(
      JSON.parse(serializeOverlay(overrides, groups, edgeStyles, nodeStyles)),
    );
    expect(isOk(decoded)).toBe(true);
    if (!isOk(decoded)) return;
    expect(decoded.value.overrides).toEqual(overrides);
    expect(decoded.value.groups).toEqual(groups);
    expect(decoded.value.edgeStyles).toEqual(edgeStyles);
    expect(decoded.value.nodeStyles).toEqual(nodeStyles);
  });

  it("decodes a legacy overlay with no styling (defaults to empty style maps)", () => {
    const decoded = decodeOverlay({ overrides: [], groups: [] });
    expect(isOk(decoded)).toBe(true);
    if (!isOk(decoded)) return;
    expect(decoded.value.edgeStyles.size).toBe(0);
    expect(decoded.value.nodeStyles.size).toBe(0);
  });

  it("decodes a legacy `{curved}` edge style into the new route enum (old share-links keep working)", () => {
    const decoded = decodeOverlay({
      overrides: [],
      groups: [],
      edgeStyles: [
        ["e0", { curved: true }],
        ["e1", { curved: false }],
      ],
      nodeStyles: [],
    });
    expect(isOk(decoded)).toBe(true);
    if (!isOk(decoded)) return;
    expect(decoded.value.edgeStyles.get(brand<string, "SceneEdgeId">("e0"))?.route).toBe("curved");
    expect(decoded.value.edgeStyles.get(brand<string, "SceneEdgeId">("e1"))?.route).toBe("square");
    expect(decoded.value.edgeStyles.get(brand<string, "SceneEdgeId">("e0"))?.labelT).toBeNull();
  });

  it("fails loudly on a malformed payload (no silent fallback)", () => {
    expect(isOk(decodeOverlay({ overrides: "nope" }))).toBe(false);
    expect(isOk(decodeOverlay(null))).toBe(false);
  });

  // The per-entry encoders are the shared source of truth for the on-the-wire shape: JSON persistence
  // and the collab Y.Map sync both encode through them, and an entry must decode through the same
  // schema. (A new domain field is caught at compile time by the encoders' `satisfies` guard.)
  it("per-entry encoders flatten brands and decode back unchanged", () => {
    const o = { position: point(10, 20), size: size(60, 24), pinned: true };
    const g = {
      id: gid("g1"),
      label: "Backend",
      members: [{ kind: "node", id: snid("A") }] as const,
      locked: false,
    };
    expect(encodeOverrideEntry(o)).toEqual({
      position: { x: 10, y: 20 },
      size: { width: 60, height: 24 },
      pinned: true,
    });
    expect(encodeGroupEntry(g)).toEqual({
      id: "g1",
      label: "Backend",
      members: [{ kind: "node", id: "A" }],
      locked: false,
    });
    // a single encoded entry round-trips through the overlay decoder (the path collab's materialise uses)
    const decoded = decodeOverlay({
      overrides: [["A", encodeOverrideEntry(o)]],
      groups: [["g1", encodeGroupEntry(g)]],
    });
    expect(isOk(decoded)).toBe(true);
    if (!isOk(decoded)) return;
    expect(decoded.value.overrides.get(snid("A"))).toEqual(o);
    expect(decoded.value.groups.get(gid("g1"))).toEqual(g);
  });

  it("per-entry STYLE encoders flatten brands and decode back unchanged (collab's Y.Map path)", () => {
    const e = {
      route: "curved" as const,
      routeOption: 2,
      labelT: 0.25,
      waypoints: [point(1, 2), point(3, 4)],
      accent: "danger" as const,
    };
    const s = { accent: "ops" as const };
    expect(encodeEdgeStyleEntry(e)).toEqual({
      route: "curved",
      routeOption: 2,
      labelT: 0.25,
      waypoints: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
      accent: "danger",
    });
    expect(encodeNodeStyleEntry(s)).toEqual({ accent: "ops" });
    const decoded = decodeOverlay({
      overrides: [],
      groups: [],
      edgeStyles: [["e0", encodeEdgeStyleEntry(e)]],
      nodeStyles: [["A", encodeNodeStyleEntry(s)]],
    });
    expect(isOk(decoded)).toBe(true);
    if (!isOk(decoded)) return;
    expect(decoded.value.edgeStyles.get(brand<string, "SceneEdgeId">("e0"))).toEqual(e);
    expect(decoded.value.nodeStyles.get(snid("A"))).toEqual(s);
  });
});
