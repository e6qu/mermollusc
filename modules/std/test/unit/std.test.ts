import { describe, expect, it } from "vitest";
import { assertNever } from "../../src/core/exhaustive.js";
import { rectContains } from "../../src/core/geometry.js";
import { andThen, err, isErr, isOk, map, ok, traverse, unwrapOr } from "../../src/core/result.js";
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

  it("andThen sequences a fallible step, short-circuiting on err", () => {
    const half = (n: number) => (n % 2 === 0 ? ok(n / 2) : err<string>("odd"));
    expect(andThen(ok(8), half)).toEqual({ ok: true, value: 4 });
    expect(andThen(ok(7), half)).toEqual({ ok: false, error: "odd" });
    expect(andThen(err<string>("boom"), half)).toEqual({ ok: false, error: "boom" });
  });

  it("traverse collects oks in order and returns the first err", () => {
    const parsePos = (n: number) => (n > 0 ? ok(n * 2) : err<string>(`bad ${n}`));
    expect(traverse([1, 2, 3], parsePos)).toEqual({ ok: true, value: [2, 4, 6] });
    expect(traverse([1, -2, 3], parsePos)).toEqual({ ok: false, error: "bad -2" });
    expect(traverse([], parsePos)).toEqual({ ok: true, value: [] });
    // index is threaded to the mapper
    expect(traverse(["a", "b"], (s, i) => ok(`${i}:${s}`))).toEqual({
      ok: true,
      value: ["0:a", "1:b"],
    });
  });
});

describe("assertNever", () => {
  it("throws loudly when a value reaches it despite the types", () => {
    // a value that escaped the type system (e.g. unchecked external input) hitting an exhaustive switch
    const sneaky = "unexpected" as unknown as never;
    expect(() => assertNever(sneaky)).toThrow(/unhandled variant/);
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
