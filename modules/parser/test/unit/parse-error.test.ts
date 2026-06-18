import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseDiagram } from "../../src/shell/diagram.js";

// The host highlights the offending range from `positions`; pin that a lexing error points at the
// actual bad character and a recognition error points inside the text (not past its end).
describe("parse error positions", () => {
  it("locates a lexing error at the offending character", () => {
    const text = "flowchart TD\n  ?\n";
    const r = parseDiagram(text);
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    expect(r.error.positions.length).toBeGreaterThan(0);
    const pos = r.error.positions[0];
    expect(pos).toBeDefined();
    if (pos === undefined) return;
    expect(text[pos.offset]).toBe("?");
    expect(pos.length).toBeGreaterThanOrEqual(1);
  });

  it("locates a recognition error within the source bounds", () => {
    const text = "flowchart TD\n  A -->\n";
    const r = parseDiagram(text);
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    for (const pos of r.error.positions) {
      expect(pos.offset).toBeGreaterThanOrEqual(0);
      expect(pos.offset).toBeLessThanOrEqual(text.length);
      expect(pos.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("emits no bogus position for an end-of-input error (EOF token has a NaN offset)", () => {
    // No trailing newline → the error is on Chevrotain's EOF token; its `startOffset` is NaN, which
    // must not leak into `positions` (it would become a NaN highlight range and crash the editor).
    for (const text of ["flowchart TD\n  A -->", "", "stateDiagram-v2\n  A -->"]) {
      const r = parseDiagram(text);
      expect(isOk(r)).toBe(false);
      if (isOk(r)) continue;
      for (const pos of r.error.positions) {
        expect(Number.isFinite(pos.offset)).toBe(true);
        expect(pos.offset).toBeLessThanOrEqual(text.length);
      }
    }
  });
});
