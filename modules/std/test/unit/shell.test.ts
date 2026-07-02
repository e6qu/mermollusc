import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LogRecord } from "../../src/core/log.js";
import { isErr, isOk } from "../../src/core/result.js";
import { brand, coordinate, length, oneOrMore, point, positive, positiveInt, rect, screenCoord, screenPoint, size, twoOrMore } from "../../src/shell/brand.js";
import { decode } from "../../src/shell/decode.js";
import { messageOf } from "../../src/shell/error.js";
import { consoleLogger, stamp } from "../../src/shell/logger.js";

const record = (level: LogRecord["level"]): LogRecord => ({
  ts: "2026-06-15T00:00:00.000Z",
  level,
  module: "std",
  event: "test-event",
  data: null,
});

describe("consoleLogger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("routes warn/error to stderr (console.error) as a JSON line", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleLogger.log(record("error"));
    consoleLogger.log(record("warn"));
    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(JSON.stringify(record("error")));
  });

  it("routes debug/info to stdout (console.log)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleLogger.log(record("info"));
    consoleLogger.log(record("debug"));
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("stamp fills a LogRecord with an ISO timestamp + the given fields", () => {
    const r = stamp("warn", "layout", "relax-failed");
    expect(r).toMatchObject({ level: "warn", module: "layout", event: "relax-failed", data: null });
    expect(r.ts).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(Number.isNaN(Date.parse(r.ts))).toBe(false);
    expect(stamp("error", "app", "x", "boom").data).toBe("boom");
  });
});

describe("decode", () => {
  const schema = z.object({ n: z.number(), label: z.string() });

  it("returns ok with the parsed value for valid input", () => {
    const r = decode(schema, { n: 1, label: "x" });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toEqual({ n: 1, label: "x" });
  });

  it("returns a loud decode error (with issues) for invalid input", () => {
    const r = decode(schema, { n: "not-a-number" });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.kind).toBe("decode");
      expect(r.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("branded geometry constructors", () => {
  it("brand is an identity at runtime", () => {
    expect(brand<number, "Coordinate">(7)).toBe(7);
  });

  it("coordinate/length/point/size/rect build the expected numeric shapes", () => {
    expect(coordinate(-3)).toBe(-3);
    expect(length(3)).toBe(3);
    expect(point(1, 2)).toEqual({ x: 1, y: 2 });
    expect(size(4, 5)).toEqual({ width: 4, height: 5 });
    expect(rect(1, 2, 3, 4)).toEqual({
      origin: { x: 1, y: 2 },
      size: { width: 3, height: 4 },
    });
  });

  it("length rejects a negative extent (fails loud)", () => {
    expect(() => length(-1)).toThrow(RangeError);
    expect(length(0)).toBe(0);
  });

  it("length rejects non-finite extents (NaN slips past a bare `< 0` guard)", () => {
    expect(() => length(Number.NaN)).toThrow(RangeError);
    expect(() => length(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("coordinate/screenCoord allow negatives but reject non-finite (fail loud at the source)", () => {
    expect(coordinate(-1000)).toBe(-1000);
    expect(screenCoord(-12)).toBe(-12);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => coordinate(bad)).toThrow(RangeError);
      expect(() => screenCoord(bad)).toThrow(RangeError);
    }
    expect(() => point(Number.NaN, 0)).toThrow(RangeError);
  });

  it("positive accepts > 0 (incl. fractions) and rejects zero/negative/non-finite", () => {
    expect(positive(0.5)).toBe(0.5);
    expect(positive(386)).toBe(386);
    expect(() => positive(0)).toThrow(RangeError);
    expect(() => positive(-1)).toThrow(RangeError);
    expect(() => positive(Number.NaN)).toThrow(RangeError);
    expect(() => positive(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("positiveInt accepts integers >= 1 and rejects 0/fractions/non-finite", () => {
    expect(positiveInt(1)).toBe(1);
    expect(positiveInt(12)).toBe(12);
    expect(() => positiveInt(0)).toThrow(RangeError);
    expect(() => positiveInt(2.5)).toThrow(RangeError);
    expect(() => positiveInt(Number.NaN)).toThrow(RangeError);
  });

  it("twoOrMore builds a >=2 tuple from first + second (+ rest), keeping order", () => {
    expect(twoOrMore("a", "b")).toEqual(["a", "b"]);
    expect(twoOrMore(1, 2, 3, 4)).toEqual([1, 2, 3, 4]);
    // [0] and [1] are statically present (required tuple slots) — the point of the type.
    const t = twoOrMore(10, 20, 30);
    expect(t[0] + t[1]).toBe(30);
  });

  it("oneOrMore builds a >=1 tuple from first (+ rest), keeping order with [0] total", () => {
    expect(oneOrMore("a")).toEqual(["a"]);
    expect(oneOrMore(1, 2, 3)).toEqual([1, 2, 3]);
    const t = oneOrMore(10, 20);
    expect(t[0]).toBe(10);
  });

  it("screenCoord/screenPoint build viewport-px values (negatives allowed, distinct brand)", () => {
    expect(screenCoord(-5)).toBe(-5);
    expect(screenPoint(12, 34)).toEqual({ x: 12, y: 34 });
  });
});

describe("messageOf", () => {
  it("returns an Error's message", () => {
    expect(messageOf(new Error("boom"))).toBe("boom");
    expect(messageOf(new TypeError("bad type"))).toBe("bad type");
  });

  it("stringifies a thrown string", () => {
    expect(messageOf("plain string")).toBe("plain string");
  });

  it("stringifies a non-error object", () => {
    expect(messageOf({ code: 42 })).toBe("[object Object]");
    expect(messageOf(null)).toBe("null");
    expect(messageOf(7)).toBe("7");
  });
});
