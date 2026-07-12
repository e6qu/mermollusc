import fc from "fast-check";
import { heuristicMeasure, layoutDiagram } from "@m/layout";
import { parseDiagram, parseDot } from "@m/parser";
import { toDot } from "@m/renderer";
import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../src/examples.js";

// Exporting a Scene to DOT, re-importing it, and exporting again must reach a fixed point: the second
// and third serialisations are identical. A drift here (e.g. a cluster id growing a `cluster_` prefix
// each round, or a node/edge appearing/disappearing) breaks idempotency. Fuzzed over every menu example
// plus single-line mutations so degenerate-but-parseable inputs are exercised too.
const reExport = async (dot: string): Promise<string | null> => {
  const back = parseDot(dot);
  if (!isOk(back)) return null;
  const laid = await layoutDiagram(back.value, heuristicMeasure);
  if (!isOk(laid)) return null;
  return toDot(laid.value, back.value.direction);
};

const firstExport = async (text: string): Promise<string | null> => {
  const parsed = parseDiagram(text);
  if (!isOk(parsed)) return null;
  const laid = await layoutDiagram(parsed.value, heuristicMeasure);
  if (!isOk(laid)) return null;
  const rankdir = "direction" in parsed.value ? parsed.value.direction : null;
  return toDot(laid.value, rankdir);
};

const dropLine = (text: string, n: number): string => {
  const lines = text.split("\n");
  if (lines.length > 1) lines.splice(n % lines.length, 1);
  return lines.join("\n");
};

describe("DOT export → import → export stability fuzz", () => {
  it("reaches an idempotent fixed point for every example (and mutations)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...EXAMPLES.values()),
        fc.nat(),
        fc.boolean(),
        async (base, n, mutate) => {
          const text = mutate ? dropLine(base, n) : base;
          const dot1 = await firstExport(text);
          if (dot1 === null) return; // a parse/layout error is a valid outcome
          const dot2 = await reExport(dot1);
          if (dot2 === null) return;
          const dot3 = await reExport(dot2);
          if (dot3 === null) return;
          // Second and third serialisations must be byte-identical — no unbounded id/structure drift.
          expect(dot3).toBe(dot2);
        },
      ),
      { numRuns: 120 },
    );
    // 120 export→import→export runs; under v8 coverage instrumentation (`make cov`) this brushed the old
    // 30s ceiling on a loaded machine. Generous headroom — a real hang would blow any bound.
  }, 60000);
});
