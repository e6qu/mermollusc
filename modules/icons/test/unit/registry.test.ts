import { isErr, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import type { IconPack } from "../../src/core/index.js";
import {
  builtinPack,
  defaultRegistry,
  findIcon,
  packNames,
  registerPack,
} from "../../src/core/index.js";

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

  it("registerPack adds a pack without mutating the original registry", () => {
    const pack: IconPack = {
      meta: { id: "extra", license: "MIT", source: "test", version: "1" },
      icons: new Map([["widget", "<svg/>"]]),
    };
    const next = registerPack(defaultRegistry, pack);
    expect(isOk(findIcon(next, "extra", "widget"))).toBe(true);
    expect(isOk(findIcon(next, "arch", "server"))).toBe(true);
    // original registry is untouched
    expect(defaultRegistry.packs.has("extra")).toBe(false);
  });
});
