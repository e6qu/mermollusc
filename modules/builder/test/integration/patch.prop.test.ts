import fc from "fast-check";
import { brand, isOk } from "@m/std";
import type { EdgeKind } from "@m/contracts";
import { parseWithSource } from "@m/parser";
import { describe, expect, it } from "vitest";
import { connect, relabelNode } from "../../src/core/patch.js";
import { validateLabel } from "../../src/core/patch.js";

const nid = (s: string) => brand<string, "NodeId">(s);

// Identifiers the flowchart lexer accepts and that never collide with a keyword.
const ident = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"), { minLength: 1, maxLength: 5 })
  .map((cs) => `n${cs.join("")}`);

// Labels that survive a print→parse round-trip: no bracket/pipe/newline, trimmed, non-empty.
const safeLabel = fc
  .array(fc.constantFrom(..."abcdefgh0123 "), { minLength: 1, maxLength: 8 })
  .map((cs) => cs.join("").trim())
  .filter((s) => s.length > 0);

const kindArb: fc.Arbitrary<EdgeKind> = fc.constantFrom("arrow", "open", "dotted", "thick");

const flowchartOf = (ids: readonly string[], labels: readonly string[]): string =>
  `flowchart TD\n${ids.map((id, i) => `  ${id}[${labels[i] ?? id}]`).join("\n")}\n`;

const parsed = (text: string) => {
  const r = parseWithSource(text);
  if (!isOk(r)) throw new Error(`parse failed: ${r.error.errors.join("; ")}`);
  return r.value;
};

describe("relabelNode — span-accurate label edit (property-based)", () => {
  it("rewrites exactly the target node's label and leaves every other node intact", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(ident, { minLength: 1, maxLength: 5 }),
        fc.array(safeLabel, { minLength: 5, maxLength: 5 }),
        fc.nat(),
        safeLabel,
        (ids, labels, idx, next) => {
          const text = flowchartOf(ids, labels);
          const victim = ids[idx % ids.length] ?? "";
          const r = relabelNode(text, parsed(text).source, nid(victim), next);
          expect(isOk(r)).toBe(true);
          if (!isOk(r)) return;

          const after = parsed(r.value).ast;
          expect(after.nodes.find((n) => n.id === victim)?.label).toBe(next);
          ids.forEach((id, i) => {
            if (id !== victim) {
              expect(after.nodes.find((n) => n.id === id)?.label).toBe(labels[i] ?? id);
            }
          });
        },
      ),
    );
  });
});

// Labels that may carry a closing/terminator delimiter — the chars that would corrupt the source if
// spliced in raw. `relabelNode` must reject these, not write un-parseable text.
const hostileLabel = fc
  .array(fc.constantFrom(..."abc01 ])}|\"\n"), { minLength: 1, maxLength: 8 })
  .map((cs) => cs.join("").trim())
  .filter((s) => s.length > 0);

describe("relabelNode — never silently corrupts the source (property-based)", () => {
  it("either round-trips the new label through parse or returns an err", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(ident, { minLength: 1, maxLength: 4 }),
        fc.nat(),
        hostileLabel,
        (ids, idx, next) => {
          const text = flowchartOf(ids, ids);
          const victim = ids[idx % ids.length] ?? "";
          const r = relabelNode(text, parsed(text).source, nid(victim), next);
          if (!isOk(r)) {
            // A rejection must mean the label actually carried a forbidden char (no false negatives).
            expect(validateLabel(next, "flowchartBracket")).toMatchObject({ ok: false });
            return;
          }
          // On success the patched text must parse and the victim's label must round-trip exactly.
          const after = parsed(r.value).ast;
          expect(after.nodes.find((n) => n.id === victim)?.label).toBe(next);
        },
      ),
    );
  });
});

describe("validateLabel — rejects each context's terminator (property-based)", () => {
  const cases: ReadonlyArray<readonly [Parameters<typeof validateLabel>[1], string]> = [
    ["flowchartBracket", "]"],
    ["flowchartBracket", ")"],
    ["flowchartBracket", "}"],
    ["flowchartBracket", "\n"],
    ["pipe", "|"],
    ["pipe", "\n"],
    ["quoted", '"'],
    ["quoted", "\n"],
    ["plain", "\n"],
  ];
  for (const [context, ch] of cases) {
    it(`rejects ${JSON.stringify(ch)} in ${context}`, () => {
      fc.assert(
        fc.property(safeLabel, safeLabel, (a, b) => {
          expect(validateLabel(`${a}${ch}${b}`, context)).toMatchObject({ ok: false });
        }),
      );
    });
  }

  it("accepts safe labels in every context", () => {
    const contexts: ReadonlyArray<Parameters<typeof validateLabel>[1]> = [
      "flowchartBracket",
      "pipe",
      "quoted",
      "plain",
    ];
    fc.assert(
      fc.property(safeLabel, (label) => {
        for (const c of contexts) expect(validateLabel(label, c)).toMatchObject({ ok: true });
      }),
    );
  });
});

describe("connect — appends exactly one edge (property-based)", () => {
  it("adds the requested edge and preserves the existing nodes", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(ident, { minLength: 2, maxLength: 5 }),
        fc.nat(),
        fc.nat(),
        kindArb,
        (ids, a, b, kind) => {
          const text = flowchartOf(ids, ids);
          const from = ids[a % ids.length] ?? "";
          const to = ids[b % ids.length] ?? "";
          const after = parsed(connect(text, nid(from), nid(to), kind)).ast;

          expect(after.edges).toHaveLength(1);
          const edge = after.edges[0];
          expect([edge?.from, edge?.to, edge?.kind]).toEqual([from, to, kind]);
          expect([...after.nodes.map((n) => n.id)].sort()).toEqual([...ids].sort());
        },
      ),
    );
  });
});
