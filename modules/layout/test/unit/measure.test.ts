import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { clampedWidth, widestLine } from "../../src/core/measure.js";

const charWidth = (s: string): number => s.length * 8; // mirrors `heuristicMeasure`
const singleLine = (s: string): string => s.replace(/\n|\\n/g, "");

describe("widestLine", () => {
  it("returns the single line's measured width for a newline-free label", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const line = singleLine(s);
        expect(widestLine(line, heuristicMeasure)).toBe(charWidth(line));
      }),
    );
  });

  it("returns the maximum over lines (>= every individual line)", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: "grapheme-ascii" }), { minLength: 1 }), (lines) => {
        const text = lines.map(singleLine).join("\n");
        const w = widestLine(text, heuristicMeasure);
        for (const line of text.split("\n")) expect(w).toBeGreaterThanOrEqual(charWidth(line));
        expect(w).toBe(Math.max(...text.split("\n").map(charWidth)));
      }),
    );
  });

  it("never throws on a pathological many-line label (totality)", () => {
    const text = Array.from({ length: 100_000 }, () => "x").join("\n");
    expect(widestLine(text, heuristicMeasure)).toBe(8);
  });
});

describe("clampedWidth", () => {
  it("is at least `min` and at least widestLine + pad", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "grapheme-ascii" }),
        fc.nat({ max: 500 }),
        fc.nat({ max: 200 }),
        (s, min, pad) => {
          const text = singleLine(s);
          const w = clampedWidth(text, heuristicMeasure, min, pad);
          expect(w).toBeGreaterThanOrEqual(min);
          expect(w).toBeGreaterThanOrEqual(widestLine(text, heuristicMeasure) + pad);
          expect(w).toBe(Math.max(min, charWidth(text) + pad));
        },
      ),
    );
  });
});
