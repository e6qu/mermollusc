import { isErr, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { builtinPack, defaultRegistry, findIcon, packNames } from "../../src/core/index.js";

describe("icons registry", () => {
  it("resolves a built-in icon to SVG markup", () => {
    const r = findIcon(defaultRegistry, "arch", "database");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value).toContain("<svg");
  });

  it("fails loudly for an unknown pack or icon", () => {
    expect(isErr(findIcon(defaultRegistry, "nope", "server"))).toBe(true);
    expect(isErr(findIcon(defaultRegistry, "arch", "nope"))).toBe(true);
  });

  it("the built-in pack carries provenance and lists its icons", () => {
    expect(builtinPack.meta.license).toBe("AGPL-3.0-or-later");
    expect(builtinPack.meta.source).toContain("built-in");
    expect(packNames(builtinPack)).toContain("server");
  });
});
