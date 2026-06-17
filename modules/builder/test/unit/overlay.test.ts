import { brand, isOk, point, size } from "@m/std";
import type { Groups, LayoutOverrides } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { decodeOverlay, serializeOverlay } from "../../src/shell/overlay.js";

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
          members: [
            { kind: "node", id: snid("A") },
            { kind: "group", id: gid("g0") },
          ],
          locked: true,
        },
      ],
    ]);

    const decoded = decodeOverlay(JSON.parse(serializeOverlay(overrides, groups)));
    expect(isOk(decoded)).toBe(true);
    if (!isOk(decoded)) return;
    expect(decoded.value.overrides).toEqual(overrides);
    expect(decoded.value.groups).toEqual(groups);
  });

  it("fails loudly on a malformed payload (no silent fallback)", () => {
    expect(isOk(decodeOverlay({ overrides: "nope" }))).toBe(false);
    expect(isOk(decodeOverlay(null))).toBe(false);
  });
});
