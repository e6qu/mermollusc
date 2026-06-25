import { brand } from "@m/std";
import type { SequenceAst } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutSequence } from "../../src/core/sequence.js";

const aid = (s: string) => brand<string, "ActorId">(s);
const mid = (s: string) => brand<string, "MessageId">(s);

const ast: SequenceAst = {
  kind: "sequence",
  actors: [
    { id: aid("A"), label: "Alice" },
    { id: aid("B"), label: "Bob" },
  ],
  messages: [
    { id: mid("m0"), from: aid("A"), to: aid("B"), text: "Hello", kind: "solid" },
    { id: mid("m1"), from: aid("B"), to: aid("A"), text: "Hi", kind: "dashedOpen" },
  ],
  notes: [],
};

describe("layoutSequence", () => {
  const result = layoutSequence(ast, heuristicMeasure);
  if (!result.ok) throw new Error(result.error.message);
  const scene = result.value;

  it("fails loudly when a message references an undeclared actor", () => {
    const bad: SequenceAst = {
      kind: "sequence",
      actors: [{ id: aid("A"), label: "Alice" }],
      messages: [{ id: mid("m0"), from: aid("A"), to: aid("Z"), text: "x", kind: "solid" }],
      notes: [],
    };
    const r = layoutSequence(bad, heuristicMeasure);
    expect(r.ok).toBe(false);
  });

  it("places actor boxes left to right", () => {
    expect(scene.nodes.map((n) => n.id)).toEqual(["A", "B"]);
    expect(scene.nodes.every((n) => n.shape === "rect")).toBe(true);
    const ax = scene.nodes[0]?.bounds.origin.x ?? 0;
    const bx = scene.nodes[1]?.bounds.origin.x ?? 0;
    expect(ax).toBe(0);
    expect(bx).toBeGreaterThan(ax);
    expect(scene.extent.size.width).toBeGreaterThan(0);
  });

  it("emits a vertical dashed lifeline per actor", () => {
    const lifelines = scene.edges.filter((e) => e.from === e.to);
    expect(lifelines).toHaveLength(2);
    for (const ll of lifelines) {
      expect(ll.waypoints[0]?.x).toBe(ll.waypoints[1]?.x); // vertical
      expect(ll.stroke).toBe("dashed");
      expect(ll.toEnd).toBe("none");
    }
  });

  it("emits horizontal message arrows styled by kind", () => {
    const m0 = scene.edges.find((e) => e.id === "m0");
    const m1 = scene.edges.find((e) => e.id === "m1");
    expect(m0).toBeDefined();
    expect(m1).toBeDefined();
    if (m0 === undefined || m1 === undefined) return;
    expect(m0.waypoints[0]?.y).toBe(m0.waypoints[1]?.y); // horizontal
    expect(m0.label).toBe("Hello");
    expect(m0).toMatchObject({ from: "A", to: "B", stroke: "solid", toEnd: "arrow" });
    expect(m1).toMatchObject({ stroke: "dashed", toEnd: "none" });
    // messages stack downward in order
    expect(m1.waypoints[0]?.y ?? 0).toBeGreaterThan(m0.waypoints[0]?.y ?? 0);
  });

  it("places notes as stateNote boxes interleaved by source order", () => {
    const withNotes: SequenceAst = {
      kind: "sequence",
      actors: [
        { id: aid("A"), label: "Alice" },
        { id: aid("B"), label: "Bob" },
      ],
      messages: [
        { id: mid("m0"), from: aid("A"), to: aid("B"), text: "hi", kind: "solid" },
        { id: mid("m1"), from: aid("B"), to: aid("A"), text: "ok", kind: "dashed" },
      ],
      notes: [
        { id: brand<string, "SequenceNoteId">("note0"), side: "over", targets: [aid("A"), aid("B")], text: "span", after: 1 },
        { id: brand<string, "SequenceNoteId">("note1"), side: "left", targets: [aid("A")], text: "aside", after: 1 },
      ],
    };
    const r = layoutSequence(withNotes, heuristicMeasure);
    if (!r.ok) throw new Error(r.error.message);
    const note0 = r.value.nodes.find((n) => n.id === "note0");
    const note1 = r.value.nodes.find((n) => n.id === "note1");
    expect(note0?.role).toBe("stateNote");
    expect(note1?.role).toBe("stateNote");
    // The note anchored after m0 sits below m0's row and above m1's.
    const m0y = r.value.edges.find((e) => e.id === "m0")?.waypoints[0]?.y ?? 0;
    const m1y = r.value.edges.find((e) => e.id === "m1")?.waypoints[0]?.y ?? 0;
    const n0y = note0?.bounds.origin.y ?? 0;
    expect(n0y).toBeGreaterThan(m0y);
    expect(n0y).toBeLessThan(m1y);
    // A `left of` note on the leftmost actor would go negative; the whole scene shifts so x >= 0.
    expect(r.value.nodes.every((n) => n.bounds.origin.x >= 0)).toBe(true);
    expect(r.value.edges.every((e) => e.waypoints.every((p) => p.x >= 0))).toBe(true);
  });
});
