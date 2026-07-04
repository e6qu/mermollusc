import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { parseState } from "../../src/shell/state-parse.js";
import { resolveNodeStyles } from "../../src/core/style.js";

const nodesOf = (src: string) => {
  const r = parseState(src);
  if (!isOk(r)) throw new Error("parse failed: " + JSON.stringify(r));
  return r.value;
};

describe("state diagram styling", () => {
  it("accepts classDef + class and applies the colour", () => {
    const v = nodesOf("stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run\n  classDef hot fill:#f96\n  class Idle hot\n");
    expect(v.states.map((s) => s.id)).toContain("Idle");
    expect(resolveNodeStyles(v.styles).get("Idle")).toEqual({ fill: "#f96", stroke: null });
  });
  it("accepts the inline :::class shorthand on a transition endpoint", () => {
    const v = nodesOf("stateDiagram-v2\n  [*] --> Idle:::hot\n  classDef hot fill:#f96\n");
    expect(resolveNodeStyles(v.styles).get("Idle")?.fill).toBe("#f96");
  });
});
