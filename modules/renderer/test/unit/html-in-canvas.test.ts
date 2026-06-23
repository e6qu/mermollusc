import { describe, expect, it } from "vitest";
import { htmlInCanvasSupported } from "../../src/shell/html-in-canvas.js";

describe("htmlInCanvasSupported", () => {
  it("returns a boolean and is false without the experimental API (node/jsdom, stable browsers)", () => {
    const supported = htmlInCanvasSupported();
    expect(typeof supported).toBe("boolean");
    // The flagged API is absent in the test environment (and every stable browser today).
    expect(supported).toBe(false);
  });

  it("probes the 2D-context prototype for the experimental entry points when the API exists", () => {
    const g = globalThis as Record<string, unknown>;
    const original = g["CanvasRenderingContext2D"];
    // A context type with neither `drawElement` nor `placeElement` on its prototype → still false, but
    // now the prototype-probe branch runs.
    class FakeCtx {}
    g["CanvasRenderingContext2D"] = FakeCtx;
    try {
      expect(htmlInCanvasSupported()).toBe(false);
      // With one of the candidate entry points present, detection flips to true.
      (FakeCtx.prototype as Record<string, unknown>)["drawElement"] = () => undefined;
      expect(htmlInCanvasSupported()).toBe(true);
    } finally {
      g["CanvasRenderingContext2D"] = original;
    }
  });
});
