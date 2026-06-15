import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { rectContains } from "../../src/core/geometry.js";
import {
  err,
  flatMap,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  type Result,
  unwrapOr,
} from "../../src/core/result.js";
import { point, rect } from "../../src/shell/brand.js";

// A Result generator over number values and string errors.
const anyResult: fc.Arbitrary<Result<number, string>> = fc.oneof(
  fc.integer().map((n) => ok(n)),
  fc.string().map((s) => err(s)),
);

describe("Result — algebraic laws (property-based)", () => {
  it("isOk and isErr are exact opposites", () => {
    fc.assert(fc.property(anyResult, (r) => isOk(r) !== isErr(r)));
  });

  it("functor identity: map(r, x => x) === r", () => {
    fc.assert(
      fc.property(anyResult, (r) => {
        expect(map(r, (x) => x)).toEqual(r);
      }),
    );
  });

  it("functor composition: map(map(r, f), g) === map(r, x => g(f(x)))", () => {
    const f = (n: number): number => n * 2 + 1;
    const g = (n: number): number => n - 7;
    fc.assert(
      fc.property(anyResult, (r) => {
        expect(map(map(r, f), g)).toEqual(map(r, (x) => g(f(x))));
      }),
    );
  });

  it("monad left identity: flatMap(ok(a), f) === f(a)", () => {
    const f = (n: number): Result<number, string> => (n > 0 ? ok(n * 3) : err("neg"));
    fc.assert(
      fc.property(fc.integer(), (a) => {
        expect(flatMap(ok(a), f)).toEqual(f(a));
      }),
    );
  });

  it("monad right identity: flatMap(r, ok) === r", () => {
    fc.assert(
      fc.property(anyResult, (r) => {
        expect(flatMap(r, ok)).toEqual(r);
      }),
    );
  });

  it("unwrapOr returns the value on ok and the default on err — never throws", () => {
    fc.assert(
      fc.property(anyResult, fc.integer(), (r, fallback) => {
        const out = unwrapOr(r, fallback);
        expect(out).toBe(isOk(r) ? r.value : fallback);
      }),
    );
  });

  it("mapErr transforms err and passes ok through untouched", () => {
    const f = (s: string): number => s.length;
    fc.assert(
      fc.property(anyResult, (r) => {
        expect(mapErr(r, f)).toEqual(isOk(r) ? r : err(f(r.error)));
      }),
    );
  });

  it("err short-circuits: map/flatMap leave an err untouched", () => {
    fc.assert(
      fc.property(fc.string(), (msg) => {
        const e = err<string>(msg);
        expect(map(e, (n: number) => n + 1)).toEqual(e);
        expect(flatMap(e, (n: number) => ok(n + 1))).toEqual(e);
      }),
    );
  });
});

describe("rectContains — invariants (property-based)", () => {
  const coord = fc.integer({ min: -500, max: 500 });
  const size = fc.integer({ min: 0, max: 500 });

  it("a rect contains its own corners and centre", () => {
    fc.assert(
      fc.property(coord, coord, size, size, (x, y, w, h) => {
        const r = rect(x, y, w, h);
        expect(rectContains(r, point(x, y))).toBe(true);
        expect(rectContains(r, point(x + w, y + h))).toBe(true);
        expect(rectContains(r, point(x + w / 2, y + h / 2))).toBe(true);
      }),
    );
  });

  it("a point past any edge is outside", () => {
    fc.assert(
      fc.property(coord, coord, size, size, (x, y, w, h) => {
        const r = rect(x, y, w, h);
        expect(rectContains(r, point(x - 1, y))).toBe(false);
        expect(rectContains(r, point(x + w + 1, y))).toBe(false);
        expect(rectContains(r, point(x, y - 1))).toBe(false);
        expect(rectContains(r, point(x, y + h + 1))).toBe(false);
      }),
    );
  });
});
