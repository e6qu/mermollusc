import fc from "fast-check";
import { brand } from "@m/std";
import type {
  SequenceAst,
  SequenceMessage,
  SequenceNote,
  SequenceNoteSide,
} from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutSequence } from "../../src/core/sequence.js";

const aid = (s: string) => brand<string, "ActorId">(s);

// Generate a well-formed sequence (every message/note endpoint is a declared actor) with notes of
// every side, including `over A,B` spans and `left of`/`right of` on the leftmost/rightmost actor —
// the cases that exercise the interleave and the negative-x shift in `layoutSequence`.
const astArb: fc.Arbitrary<SequenceAst> = fc
  .integer({ min: 1, max: 5 })
  .chain((actorCount) => {
    const ids = Array.from({ length: actorCount }, (_, i) => `a${i}`);
    const actorIdx = fc.integer({ min: 0, max: actorCount - 1 });
    const side: fc.Arbitrary<SequenceNoteSide> = fc.constantFrom("left", "right", "over");
    const message = fc.record({ from: actorIdx, to: actorIdx, kind: fc.constant("solid" as const) });
    const note = fc.record({
      side,
      targets: fc.uniqueArray(actorIdx, { minLength: 1, maxLength: 2 }),
      text: fc.string({ minLength: 0, maxLength: 12 }),
      after: fc.nat(),
    });
    return fc
      .tuple(
        fc.array(message, { minLength: 0, maxLength: 6 }),
        fc.array(note, { minLength: 0, maxLength: 5 }),
      )
      .map(([msgs, notes]): SequenceAst => {
        const messages: SequenceMessage[] = msgs.map((m, i) => ({
          id: brand<string, "MessageId">(`m${i}`),
          from: aid(ids[m.from] ?? "a0"),
          to: aid(ids[m.to] ?? "a0"),
          text: "",
          kind: m.kind,
        }));
        // `after` is non-decreasing in source order; clamp + sort so the arbitrary respects that.
        const builtNotes: SequenceNote[] = notes
          .map((n) => Math.min(n.after, messages.length))
          .sort((x, y) => x - y)
          .map((after, i) => ({
            id: brand<string, "SequenceNoteId">(`note${i}`),
            side: notes[i]?.side ?? "over",
            targets: (notes[i]?.targets ?? [0]).map((t) => aid(ids[t] ?? "a0")),
            text: notes[i]?.text ?? "",
            after,
          }));
        return {
          kind: "sequence",
          actors: ids.map((id) => ({ id: aid(id), label: id })),
          messages,
          notes: builtNotes,
        };
      });
  });

describe("layoutSequence note fuzz", () => {
  it("is total and keeps finite, non-negative geometry over arbitrary noted sequences", () => {
    fc.assert(
      fc.property(astArb, (ast) => {
        const r = layoutSequence(ast, heuristicMeasure);
        // Every endpoint is a declared actor, so a valid sequence always lays out.
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        for (const n of r.value.nodes) {
          expect(Number.isFinite(n.bounds.origin.x)).toBe(true);
          expect(Number.isFinite(n.bounds.size.width)).toBe(true);
          // The negative-x shift must leave every node at or right of the origin.
          expect(n.bounds.origin.x).toBeGreaterThanOrEqual(0);
        }
        for (const e of r.value.edges) {
          for (const p of e.waypoints) expect(p.x).toBeGreaterThanOrEqual(0);
        }
        // Each note becomes exactly one stateNote scene node.
        const noteNodes = r.value.nodes.filter((n) => n.role === "stateNote");
        expect(noteNodes).toHaveLength(ast.notes.length);
      }),
      { numRuns: 800 },
    );
  });
});
