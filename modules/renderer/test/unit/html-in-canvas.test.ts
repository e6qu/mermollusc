import { describe, expect, it } from "vitest";
import { htmlInCanvasSupported } from "../../src/shell/html-in-canvas.js";

describe("htmlInCanvasSupported", () => {
  it("returns a boolean and is false without the experimental API (node/jsdom, stable browsers)", () => {
    const supported = htmlInCanvasSupported();
    expect(typeof supported).toBe("boolean");
    // The flagged API is absent in the test environment (and every stable browser today).
    expect(supported).toBe(false);
  });
});
