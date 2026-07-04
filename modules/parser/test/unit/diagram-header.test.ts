import { describe, expect, it } from "vitest";
import { looksLikeDiagramHeader } from "../../src/shell/diagram.js";

describe("looksLikeDiagramHeader", () => {
  it("recognises a diagram header (skipping blank/comment lines)", () => {
    for (const h of ["flowchart TD\n A-->B", "sequenceDiagram\n A->>B: x", "stateDiagram-v2", "pie", "%% c\n\nerDiagram"])
      expect(looksLikeDiagramHeader(h)).toBe(true);
  });
  it("rejects a bare snippet with no header", () => {
    for (const s of ["  A --> B", "style A fill:red", ""]) expect(looksLikeDiagramHeader(s)).toBe(false);
  });
});
