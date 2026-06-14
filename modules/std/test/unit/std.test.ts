import { describe, expect, it } from "vitest";
import { rectContains } from "../../src/core/geometry.js";
import { err, isErr, isOk, map, ok, unwrapOr } from "../../src/core/result.js";
import { point, rect } from "../../src/shell/brand.js";

describe("Result", () => {
  it("ok and err discriminate", () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err("boom"))).toBe(true);
  });

  it("map transforms ok and passes err through", () => {
    expect(map(ok(2), (n) => n + 1)).toEqual({ ok: true, value: 3 });
    expect(map(err<string>("boom"), (n: number) => n + 1)).toEqual({ ok: false, error: "boom" });
  });

  it("unwrapOr returns the explicit default on err", () => {
    expect(unwrapOr(ok(5), 9)).toBe(5);
    expect(unwrapOr(err<string>("boom"), 9)).toBe(9);
  });
});

describe("rectContains", () => {
  const r = rect(0, 0, 10, 10);
  it("includes the interior and the border", () => {
    expect(rectContains(r, point(5, 5))).toBe(true);
    expect(rectContains(r, point(0, 0))).toBe(true);
    expect(rectContains(r, point(10, 10))).toBe(true);
  });
  it("excludes points outside", () => {
    expect(rectContains(r, point(11, 5))).toBe(false);
    expect(rectContains(r, point(5, -1))).toBe(false);
  });
});
