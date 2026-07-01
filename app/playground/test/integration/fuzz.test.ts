import fc from "fast-check";
import { heuristicMeasure, layoutDiagram } from "@m/layout";
import { parseDiagramWithSource } from "@m/parser";
import { darkTheme, defaultTheme, toDisplayList, toSvg } from "@m/renderer";
import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../src/examples.js";

const FUZZ_TIMEOUT_MS = 90_000;

// Per-source text mutations that keep an input *near* valid, so the parser often still accepts it and
// the layout (the real target — its totality + the depth guards on nested families) is exercised on
// adversarial-but-structured ASTs, where a throw or infinite recursion is most likely.
type Mut =
  | { readonly k: "dropLine"; readonly n: number }
  | { readonly k: "dupLine"; readonly n: number }
  | { readonly k: "swapLines"; readonly a: number; readonly b: number }
  | { readonly k: "dropChar"; readonly n: number }
  | { readonly k: "insChar"; readonly n: number; readonly c: string }
  | { readonly k: "indent"; readonly n: number; readonly by: number };

const mutArb: fc.Arbitrary<Mut> = fc.oneof(
  fc.record({ k: fc.constant("dropLine" as const), n: fc.nat() }),
  fc.record({ k: fc.constant("dupLine" as const), n: fc.nat() }),
  fc.record({ k: fc.constant("swapLines" as const), a: fc.nat(), b: fc.nat() }),
  fc.record({ k: fc.constant("dropChar" as const), n: fc.nat() }),
  fc.record({ k: fc.constant("insChar" as const), n: fc.nat(), c: fc.constantFrom(..."[]{}|:; \t-") }),
  fc.record({ k: fc.constant("indent" as const), n: fc.nat(), by: fc.integer({ min: -4, max: 8 }) }),
);

const applyMut = (text: string, m: Mut): string => {
  const lines = text.split("\n");
  const at = (i: number): number => (lines.length === 0 ? 0 : i % lines.length);
  switch (m.k) {
    case "dropLine":
      if (lines.length > 1) lines.splice(at(m.n), 1);
      return lines.join("\n");
    case "dupLine": {
      const i = at(m.n);
      lines.splice(i, 0, lines[i] ?? "");
      return lines.join("\n");
    }
    case "swapLines": {
      const i = at(m.a);
      const j = at(m.b);
      const tmp = lines[i] ?? "";
      lines[i] = lines[j] ?? "";
      lines[j] = tmp;
      return lines.join("\n");
    }
    case "dropChar":
      return text.length === 0 ? text : text.slice(0, m.n % text.length) + text.slice((m.n % text.length) + 1);
    case "insChar": {
      const i = m.n % (text.length + 1);
      return text.slice(0, i) + m.c + text.slice(i);
    }
    case "indent": {
      const i = at(m.n);
      const line = lines[i] ?? "";
      lines[i] = m.by >= 0 ? " ".repeat(m.by) + line : line.replace(/^ {0,4}/, "");
      return lines.join("\n");
    }
  }
};

describe("pipeline fuzz — parse → layout totality over mutated examples", () => {
  it("layout never throws or hangs on any input the parser accepts", async () => {
    const examples = [...EXAMPLES.values()];
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...examples),
        fc.array(mutArb, { minLength: 0, maxLength: 6 }),
        async (base, muts) => {
          const text = muts.reduce(applyMut, base);
          const parsed = parseDiagramWithSource(text);
          if (!isOk(parsed)) return; // a parse error is a valid (loud) outcome
          const laid = await layoutDiagram(parsed.value.ast, heuristicMeasure);
          // Totality: a Result either way, never an exception or a hang (the test timeout guards hangs).
          expect(typeof laid.ok).toBe("boolean");
          if (isOk(laid)) {
            // A successful layout must produce finite geometry — no NaN/Infinity leaking into the scene.
            for (const node of laid.value.nodes) {
              expect(Number.isFinite(node.bounds.origin.x)).toBe(true);
              expect(Number.isFinite(node.bounds.size.width)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 600 },
    );
  }, FUZZ_TIMEOUT_MS);
});

describe("render fuzz — layout → display list → SVG totality over mutated examples", () => {
  it("the renderer never throws and never leaks NaN/Infinity into the SVG", async () => {
    const examples = [...EXAMPLES.values()];
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...examples),
        fc.array(mutArb, { minLength: 0, maxLength: 6 }),
        fc.boolean(),
        async (base, muts, dark) => {
          const text = muts.reduce(applyMut, base);
          const parsed = parseDiagramWithSource(text);
          if (!isOk(parsed)) return;
          const laid = await layoutDiagram(parsed.value.ast, heuristicMeasure);
          if (!isOk(laid)) return;
          const scene = laid.value;
          // The pure display-list builder must be total over any laid-out scene.
          const cmds = toDisplayList(scene);
          expect(Array.isArray(cmds)).toBe(true);
          // The shell SVG serializer must produce a well-formed document with no non-finite numbers —
          // a single NaN/Infinity in a coordinate would corrupt the whole export silently in a viewer.
          const svg = toSvg(cmds, {
            width: Math.ceil(scene.extent.size.width) + 16,
            height: Math.ceil(scene.extent.size.height) + 16,
            origin: scene.extent.origin,
            margin: 8,
            theme: dark ? darkTheme : defaultTheme,
            icons: new Map(),
          });
          expect(svg.startsWith("<svg")).toBe(true);
          expect(svg).not.toContain("NaN");
          expect(svg).not.toContain("Infinity");
        },
      ),
      { numRuns: 500 },
    );
  }, FUZZ_TIMEOUT_MS);
});
