import fc from "fast-check";
import { addEdgeLabel, patchSpan, restyleEdge } from "@m/builder";
import type { EdgeId, EdgeKind } from "@m/contracts";
import { parseBlockWithSource, parseWithSource } from "@m/parser";
import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";

// Random sequences of the edge edits (restyle the arrow, add a label to a bare edge, rename a labelled
// edge) must always leave the source parseable — never a half-spliced arrow/pipe. The source is
// re-parsed each step so every edit uses fresh spans, mirroring how the app re-renders after each edit.
const KINDS: readonly EdgeKind[] = ["arrow", "open", "dotted", "thick"];
const sanitize = (s: string): string => s.replace(/[|\n]/g, "").trim();

const opArb = fc.record({
  edge: fc.nat(),
  kind: fc.nat(),
  label: fc.string({ maxLength: 8 }),
  restyle: fc.boolean(),
});

type EdgeSpans = {
  readonly edges: ReadonlyArray<{ readonly id: EdgeId; readonly kind: EdgeKind }>;
  readonly arrowOf: (id: EdgeId) => { readonly start: number; readonly end: number } | undefined;
  readonly labelOf: (id: EdgeId) => { readonly start: number; readonly end: number } | undefined;
};

const flowSpans = (text: string): EdgeSpans | null => {
  const p = parseWithSource(text);
  if (!isOk(p)) return null;
  return {
    edges: p.value.ast.edges.map((e) => ({ id: e.id, kind: e.kind })),
    arrowOf: (id) => p.value.source.arrows.get(id),
    labelOf: (id) => p.value.source.edges.get(id),
  };
};
const blockSpans = (text: string): EdgeSpans | null => {
  const p = parseBlockWithSource(text);
  if (!isOk(p)) return null;
  return {
    edges: p.value.ast.edges.map((e) => ({ id: e.id, kind: e.kind })),
    arrowOf: (id) => p.value.source.arrows.get(id),
    labelOf: (id) => p.value.source.edges.get(id),
  };
};

const runFuzz = (seed: string, spansOf: (t: string) => EdgeSpans | null): void => {
  fc.assert(
    fc.property(fc.array(opArb, { maxLength: 8 }), (ops) => {
      let text = seed;
      for (const op of ops) {
        const spans = spansOf(text);
        if (spans === null || spans.edges.length === 0) continue;
        const e = spans.edges[op.edge % spans.edges.length];
        if (e === undefined) continue;
        const arrow = spans.arrowOf(e.id);
        const label = spans.labelOf(e.id);
        if (op.restyle && arrow !== undefined) {
          text = restyleEdge(text, arrow, KINDS[op.kind % KINDS.length] ?? "arrow");
        } else if (label !== undefined) {
          const clean = sanitize(op.label);
          if (clean.length > 0) text = patchSpan(text, label, clean); // rename (app validates the same)
        } else if (arrow !== undefined) {
          const clean = sanitize(op.label);
          if (clean.length > 0) {
            const r = addEdgeLabel(text, arrow, clean);
            if (isOk(r)) text = r.value;
          }
        }
        // Whatever the edit, the source must still parse.
        expect(spansOf(text)).not.toBeNull();
      }
    }),
    { numRuns: 400 },
  );
};

describe("edge-edit fuzz — restyle/label/rename never corrupts the source", () => {
  it("flowchart edges stay parseable through random edit sequences", () => {
    runFuzz("flowchart TD\n  A --> B --> C\n  A -.->|x| C\n  C ==> A\n", flowSpans);
  });
  it("block edges stay parseable through random edit sequences", () => {
    runFuzz('block-beta\n  a["A"]\n  b["B"]\n  c["C"]\n  a --> b\n  b -.->|x| c\n', blockSpans);
  });
  it("a no-op sanity: the seed re-parses and exposes every edge's arrow span", () => {
    const spans = flowSpans("flowchart TD\n  A --> B --> C\n");
    expect(spans).not.toBeNull();
    if (spans === null) return;
    for (const e of spans.edges) expect(spans.arrowOf(brand<string, "EdgeId">(e.id))).toBeDefined();
  });
});
