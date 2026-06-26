import { isErr, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import type { IconPack } from "../../src/core/index.js";
import {
  bpmnPack,
  builtinPack,
  defaultRegistry,
  findIcon,
  packNames,
  deviconPack,
  gilbarbaraPack,
  k8sPack,
  registerPack,
  simpleIconsPack,
  categoryNames,
  iconsInCategory,
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
    for (const name of ["aws", "azure", "googlecloud", "oracle", "python", "react", "rust"]) {
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

  it("bundles the original AGPL sketch glyph pack (hand-drawn person/infra/doc)", () => {
    const sketch = findIcon(defaultRegistry, "sketch", "person");
    expect(isOk(sketch)).toBe(true);
    if (isOk(sketch)) expect(sketch.value).toContain("<svg");
    expect(isOk(findIcon(defaultRegistry, "sketch", "database"))).toBe(true);
  });

  it("bundles the full original AGPL BPMN-2.0 glyph set (typed events / task types / gateways / data)", () => {
    expect(bpmnPack.meta.license).toBe("AGPL-3.0-or-later");
    // A spread across every BPMN element family — the typed events, task type markers, the complete
    // gateway set, the data shapes and the artifacts — each resolving to an SVG.
    for (const name of [
      "start-message",
      "start-timer",
      "intermediate-error",
      "intermediate-link",
      "end-terminate",
      "user-task",
      "service-task",
      "send-task",
      "business-rule-task",
      "call-activity",
      "complex-gateway",
      "event-gateway",
      "data-input",
      "data-collection",
      "group",
      "pool",
    ]) {
      const r = findIcon(defaultRegistry, "bpmn", name);
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toContain("<svg");
    }
    expect(categoryNames(bpmnPack)).toEqual(
      expect.arrayContaining(["event", "activity", "gateway", "data", "artifact"]),
    );
  });

  it("categorises every glyph of the authored packs (no orphan icons)", () => {
    for (const pack of [builtinPack, bpmnPack]) {
      const categorised = new Set(
        categoryNames(pack).flatMap((cat) => iconsInCategory(pack, cat)),
      );
      for (const name of packNames(pack)) expect(categorised.has(name)).toBe(true);
    }
  });

  it("registerPack adds a pack without mutating the original registry", () => {
    const pack: IconPack = {
      meta: { id: "extra", license: "MIT", source: "test", version: "1" },
      icons: new Map([["widget", "<svg/>"]]),
      categories: new Map([["all", ["widget"]]]),
    };
    const next = registerPack(defaultRegistry, pack);
    expect(isOk(findIcon(next, "extra", "widget"))).toBe(true);
    expect(isOk(findIcon(next, "arch", "server"))).toBe(true);
    // original registry is untouched
    expect(defaultRegistry.packs.has("extra")).toBe(false);
  });

  it("exposes per-icon categories, with brand packs under a 'brands' category", () => {
    // Authored packs carry meaningful categories.
    expect(categoryNames(builtinPack)).toEqual(
      expect.arrayContaining(["compute", "data", "network"]),
    );
    expect(iconsInCategory(builtinPack, "network")).toContain("router");
    expect(categoryNames(bpmnPack)).toContain("gateway");
    // Vendored brand-logo packs are all "brands"; k8s is "resources".
    expect(categoryNames(simpleIconsPack)).toEqual(["brands"]);
    expect(iconsInCategory(deviconPack, "brands")).toContain("aws");
    expect(categoryNames(k8sPack)).toEqual(["resources"]);
    // Every categorised name is a real icon in the pack.
    for (const name of iconsInCategory(builtinPack, "compute")) {
      expect(builtinPack.icons.has(name)).toBe(true);
    }
    // An unknown category yields no icons.
    expect(iconsInCategory(builtinPack, "nope")).toEqual([]);
  });
});
