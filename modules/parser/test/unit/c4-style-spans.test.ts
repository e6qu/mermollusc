import { describe, expect, it } from "vitest";
import { brand, isOk } from "@m/std";
import { parseC4WithSource } from "../../src/shell/c4-parse.js";

describe("c4 styleSpans (write-side)", () => {
  it("captures the whole UpdateElementStyle(...) call span for in-place colour edits", () => {
    const src =
      'C4Context\n  Person(alice, "Alice")\n  UpdateElementStyle(alice, $bgColor="#f00")\n';
    const r = parseC4WithSource(src);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    const span = r.value.source.styleSpans.get(brand<string, "C4ElementId">("alice"));
    expect(span).toBeDefined();
    if (span === undefined) throw new Error("no span");
    expect(src.slice(span.start, span.end)).toBe('UpdateElementStyle(alice, $bgColor="#f00")');
  });
});
