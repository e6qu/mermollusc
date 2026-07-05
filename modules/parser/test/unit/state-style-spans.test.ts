import { describe, expect, it } from "vitest";
import { brand, isOk } from "@m/std";
import { parseStateWithSource } from "../../src/shell/state-parse.js";

describe("state styleSpans (write-side)", () => {
  it("captures the span of a single-target `style <id>` line so it can be edited in place", () => {
    const src = "stateDiagram-v2\n  [*] --> Idle\n  style Idle fill:#f96\n";
    const r = parseStateWithSource(src);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) throw new Error("parse failed");
    const span = r.value.source.styleSpans.get(brand<string, "StateId">("Idle"));
    expect(span).toBeDefined();
    if (span === undefined) throw new Error("no span");
    expect(src.slice(span.start, span.end)).toBe("style Idle fill:#f96");
  });
  it("does not capture a span for a multi-target `style A,B` line (not per-node editable)", () => {
    const r = parseStateWithSource("stateDiagram-v2\n  [*] --> A\n  A --> B\n  style A,B fill:#f96\n");
    if (!isOk(r)) throw new Error("parse failed");
    expect(r.value.source.styleSpans.size).toBe(0);
  });
});
