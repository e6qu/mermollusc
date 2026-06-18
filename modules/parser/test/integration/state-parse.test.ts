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
    expect(byId.get("__state_start")?.kind).toBe("start");
    expect(byId.get("__state_end")?.kind).toBe("end");
    expect(r.value.transitions).toHaveLength(3);
    expect(r.value.transitions.find((t) => t.from === "Idle" && t.to === "Running")?.label).toBe(
      "start",
    );
    expect(r.value.transitions[0]).toMatchObject({ from: "__state_start", to: "Idle" });
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
