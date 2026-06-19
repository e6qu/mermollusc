import fc from "fast-check";
import { brand, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { applyOverrides, clearOverride, moveNode } from "../../src/core/overrides.js";
import { addNode, deleteNode, patchSpan } from "../../src/core/patch.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const nid = (s: string) => brand<string, "NodeId">(s);

const ident = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"), { minLength: 1, maxLength: 6 })
  .map((cs) => cs.join(""));

const sceneOf = (ids: readonly string[]): Scene => ({
  nodes: ids.map((id, i) => ({
    id: snid(id),
    bounds: rect(i * 10, 0, 60, 40),
    label: id,
    shape: "rect",
    parent: null,
    icon: null,
    rowDivider: null, subtitle: null, rows: null,
  })),
  edges: [],
  extent: rect(0, 0, ids.length * 10 + 60, 40),
});

describe("patchSpan — splice invariants (property-based)", () => {
  it("replaces exactly the span and is reversible", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.nat(), fc.nat(), (text, repl, a, b) => {
        const start = a % (text.length + 1);
        const end = start + (b % (text.length - start + 1));
        const out = patchSpan(text, { start, end }, repl);
        expect(out).toBe(text.slice(0, start) + repl + text.slice(end));
        expect(out.length).toBe(text.length - (end - start) + repl.length);
        // Replacing the inserted region back with the original slice restores the text.
        const back = patchSpan(out, { start, end: start + repl.length }, text.slice(start, end));
        expect(back).toBe(text);
      }),
    );
  });
});

describe("moveNode / applyOverrides — invariants (property-based)", () => {
  it("repositions exactly the targeted node and leaves the rest untouched", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(ident, { minLength: 1, maxLength: 6 }),
        fc.nat(),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        (ids, idx, x, y) => {
          const s = sceneOf(ids);
          const id = snid(ids[idx % ids.length] ?? "");
          const moved = applyOverrides(s, moveNode(new Map(), id, point(x, y)));
          expect(moved.nodes).toHaveLength(s.nodes.length);
          for (const n of moved.nodes) {
            if (n.id === id) {
              expect(n.bounds.origin).toEqual({ x, y });
            } else {
              const original = s.nodes.find((o) => o.id === n.id);
              expect(n.bounds.origin).toEqual(original?.bounds.origin);
            }
          }
        },
      ),
    );
  });

  it("clearOverride undoes a moveNode applied to an empty override set", () => {
    fc.assert(
      fc.property(ident, fc.integer(), fc.integer(), (idStr, x, y) => {
        const id = snid(idStr);
        const out = clearOverride(moveNode(new Map(), id, point(x, y)), id);
        expect(out.size).toBe(0);
      }),
    );
  });
});

describe("addNode / deleteNode — text invariants (property-based)", () => {
  it("addNode keeps the original text as a prefix and appends the labelled node", () => {
    fc.assert(
      fc.property(fc.string(), ident, ident, (text, idStr, labelStr) => {
        const out = addNode(text, nid(idStr), labelStr, "rect");
        expect(out.startsWith(text)).toBe(true);
        expect(out).toContain(`${idStr}[${labelStr}]`);
      }),
    );
  });

  it("deleteNode removes the victim's bare line and keeps the others", () => {
    fc.assert(
      fc.property(fc.uniqueArray(ident, { minLength: 2, maxLength: 6 }), fc.nat(), (ids, idx) => {
        const text = `flowchart TD\n${ids.map((id) => `  ${id}`).join("\n")}\n`;
        const victim = ids[idx % ids.length] ?? "";
        const lines = deleteNode(text, nid(victim))
          .split("\n")
          .map((l) => l.trim());
        expect(lines).not.toContain(victim);
        for (const id of ids) if (id !== victim) expect(lines).toContain(id);
      }),
    );
  });
});
