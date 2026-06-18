import { brand, isOk } from "@m/std";
import type { StateNode } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { parseState, parseStateWithSource } from "../../src/shell/state-parse.js";

const brandState = (s: string) => brand<string, "StateId">(s);
const brandTransition = (s: string) => brand<string, "StateTransitionId">(s);

describe("parseState", () => {
  it("parses transitions, [*] start/end, descriptions, and `state … as`", () => {
    const text = `stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  state "Running fast" as Running
  Running --> [*]
`;
    const r = parseState(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const byId = new Map<string, StateNode>(r.value.states.map((s) => [s.id, s]));
    expect(byId.get("Idle")).toMatchObject({ kind: "state", label: "Idle" });
    expect(byId.get("Running")).toMatchObject({ kind: "state", label: "Running fast" });
    expect(byId.get("__start")?.kind).toBe("start");
    expect(byId.get("__end")?.kind).toBe("end");
    expect(r.value.transitions).toHaveLength(3);
    expect(r.value.transitions.find((t) => t.from === "Idle" && t.to === "Running")?.label).toBe(
      "start",
    );
    expect(r.value.transitions[0]).toMatchObject({ from: "__start", to: "Idle" });
  });

  it("nests a composite `state X { … }` with its own scoped [*]", () => {
    const text = `stateDiagram-v2
  [*] --> Active
  state Active {
    [*] --> Idle
    Idle --> Running : go
  }
  Active --> [*]
`;
    const r = parseState(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    // Active is a composite (container), not a leaf state.
    expect(r.value.states.find((s) => s.id === "Active")).toBeUndefined();
    const active = r.value.composites.find((c) => c.id === "Active");
    expect(active).toBeDefined();
    expect(active?.parent).toBeNull();
    // Its members are the nested states + its own scoped start pseudo-state.
    expect(active?.states).toEqual(expect.arrayContaining(["__start__Active", "Idle", "Running"]));
    // The top-level [*] is distinct from the composite's inner [*].
    const ids = r.value.states.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["__start", "__end", "__start__Active"]));
    // Transitions cross the boundary: root start → Active, Active → root end.
    expect(r.value.transitions.find((t) => t.from === "__start" && t.to === "Active")).toBeDefined();
    expect(r.value.transitions.find((t) => t.from === "Active" && t.to === "__end")).toBeDefined();
  });

  it("records a relabel span for a description and a transition label", () => {
    const text = "stateDiagram-v2\n  A : Active\n  A --> B : go\n";
    const r = parseStateWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const aSpan = r.value.source.states.get(brandState("A"));
    expect(aSpan).toBeDefined();
    if (aSpan !== undefined) expect(text.slice(aSpan.start, aSpan.end)).toBe("Active");
    const t0 = r.value.source.transitions.get(brandTransition("t0"));
    if (t0 !== undefined) expect(text.slice(t0.start, t0.end)).toBe("go");
  });

  it("fails loudly on a malformed transition", () => {
    expect(isOk(parseState("stateDiagram-v2\n  A --> \n"))).toBe(false);
  });
});
