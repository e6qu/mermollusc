import { isErr, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import type { IconPack } from "../../src/core/index.js";
import {
  builtinPack,
  defaultRegistry,
  findIcon,
  packNames,
  deviconPack,
  gilbarbaraPack,
  k8sPack,
  registerPack,
  simpleIconsPack,
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

  it("bundles the vendored simple-icons pack with pinned CC0 provenance", () => {
    expect(simpleIconsPack.meta.license).toBe("CC0-1.0");
    expect(simpleIconsPack.meta.source).toContain("simple-icons");
    // version is a pinned 40-char commit SHA
    expect(simpleIconsPack.meta.version).toMatch(/^[0-9a-f]{40}$/);
    // resolves through the default registry as real SVG markup
    const r = findIcon(defaultRegistry, "simpleicons", "kubernetes");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toContain("<svg");
    expect(packNames(simpleIconsPack)).toContain("docker");
  });

  it("bundles the vendored devicon pack (MIT) with the AWS/Azure/GCP brand marks", () => {
    expect(deviconPack.meta.license).toBe("MIT");
    expect(deviconPack.meta.version).toMatch(/^[0-9a-f]{40}$/);
    for (const name of ["aws", "azure", "googlecloud", "oracle"]) {
      const r = findIcon(defaultRegistry, "devicon", name);
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toContain("<svg");
    }
  });

  it("bundles the vendored gilbarbara pack (CC0) with per-service AWS marks", () => {
    expect(gilbarbaraPack.meta.license).toBe("CC0-1.0");
    expect(gilbarbaraPack.meta.version).toMatch(/^[0-9a-f]{40}$/);
    const r = findIcon(defaultRegistry, "gilbarbara", "aws-lambda");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toContain("<svg");
  });

  it("bundles the vendored Kubernetes-community pack (Apache-2.0) with resource shapes", () => {
    expect(k8sPack.meta.license).toBe("Apache-2.0");
    expect(k8sPack.meta.version).toMatch(/^[0-9a-f]{40}$/);
    for (const name of ["pod", "deploy", "svc", "node"]) {
      const r = findIcon(defaultRegistry, "k8s", name);
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toContain("<svg");
    }
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
