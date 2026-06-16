import { isErr, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { findIcon, registerPack } from "../../src/core/index.js";
import { decodePack } from "../../src/shell/load.js";

const validJson = {
  meta: { id: "aws", license: "vendor (user-supplied)", source: "local", version: "2024.1" },
  icons: { lambda: "<svg>l</svg>", s3: "<svg>s</svg>" },
};

describe("decodePack", () => {
  it("decodes a valid pack payload into an IconPack (icons as a Map)", () => {
    const r = decodePack(validJson);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.meta.id).toBe("aws");
    expect(r.value.icons.get("lambda")).toBe("<svg>l</svg>");
    expect(r.value.icons.size).toBe(2);
  });

  it("defaults icons to an 'all' category when none is given, and honours a provided one", () => {
    const auto = decodePack(validJson);
    expect(isOk(auto)).toBe(true);
    if (isOk(auto)) expect([...auto.value.categories.keys()]).toEqual(["all"]);

    const withCats = decodePack({ ...validJson, categories: { brands: ["lambda", "s3"] } });
    expect(isOk(withCats)).toBe(true);
    if (isOk(withCats)) expect(withCats.value.categories.get("brands")).toEqual(["lambda", "s3"]);
  });

  it("fails loudly when provenance fields are missing or mistyped", () => {
    expect(isErr(decodePack({ icons: { a: "<svg/>" } }))).toBe(true);
    expect(isErr(decodePack({ meta: { id: "x" }, icons: {} }))).toBe(true);
    expect(isErr(decodePack({ meta: validJson.meta, icons: { a: 1 } }))).toBe(true);
    expect(isErr(decodePack("not an object"))).toBe(true);
  });

  it("a decoded pack registers and resolves through findIcon", () => {
    const r = decodePack(validJson);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const registry = registerPack({ packs: new Map() }, r.value);
    const icon = findIcon(registry, "aws", "s3");
    expect(isOk(icon)).toBe(true);
    if (isOk(icon)) expect(icon.value).toBe("<svg>s</svg>");
  });
});
