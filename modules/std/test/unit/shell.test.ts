import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LogRecord } from "../../src/core/log.js";
import { isErr, isOk } from "../../src/core/result.js";
import { brand, coordinate, length, point, rect, size } from "../../src/shell/brand.js";
import { decode } from "../../src/shell/decode.js";
import { consoleLogger, stamp } from "../../src/shell/logger.js";

const record = (level: LogRecord["level"]): LogRecord => ({
  ts: "2026-06-15T00:00:00.000Z",
  level,
  module: "std",
  event: "test-event",
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
    expect(r).toMatchObject({ level: "warn", module: "layout", event: "relax-failed" });
    expect(r.ts).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(Number.isNaN(Date.parse(r.ts))).toBe(false);
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
});
