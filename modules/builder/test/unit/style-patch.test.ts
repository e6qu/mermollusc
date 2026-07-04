import { brand } from "@m/std";
import type { TextSpan } from "@m/contracts";
import { describe, expect, it } from "vitest";
import {
  removeLinkStyleDirective,
  removeNodeStyleDirective,
  setLinkStyleDirective,
  setNodeStyleDirective,
} from "../../src/core/patch.js";

const nid = (s: string) => brand<string, "NodeId">(s);

describe("node style directive patches", () => {
  const base = "flowchart TD\n  A --> B\n";

  it("appends a `style` line when the node has none", () => {
    const out = setNodeStyleDirective(base, null, nid("A"), "#fecaca", null);
    expect(out).toBe("flowchart TD\n  A --> B\n  style A fill:#fecaca\n");
  });

  it("includes stroke when supplied", () => {
    const out = setNodeStyleDirective(base, null, nid("A"), "#fecaca", "#b91c1c");
    expect(out).toContain("style A fill:#fecaca,stroke:#b91c1c");
  });

  it("rewrites an existing single-target style line in place via its span", () => {
    const text = "flowchart TD\n  A --> B\n  style A fill:#f9f\n";
    const start = text.indexOf("style A");
    const span: TextSpan = { start, end: text.indexOf("\n", start) };
    const out = setNodeStyleDirective(text, span, nid("A"), "#16a34a", null);
    expect(out).toBe("flowchart TD\n  A --> B\n  style A fill:#16a34a\n");
  });

  it("removes a style line entirely (indent + trailing newline, no blank line)", () => {
    const text = "flowchart TD\n  A --> B\n  style A fill:#f9f\n";
    const start = text.indexOf("style A");
    const span: TextSpan = { start, end: text.indexOf("\n", start) };
    expect(removeNodeStyleDirective(text, span)).toBe("flowchart TD\n  A --> B\n");
  });
});

describe("edge linkStyle directive patches", () => {
  const base = "flowchart TD\n  A --> B\n";
  it("appends a `linkStyle <index>` line when the edge has none", () => {
    expect(setLinkStyleDirective(base, null, 0, "#dc2626")).toBe(
      "flowchart TD\n  A --> B\n  linkStyle 0 stroke:#dc2626\n",
    );
  });
  it("rewrites an existing linkStyle line in place via its span", () => {
    const text = "flowchart TD\n  A --> B\n  linkStyle 0 stroke:#f00\n";
    const start = text.indexOf("linkStyle");
    const span = { start, end: text.indexOf("\n", start) };
    expect(setLinkStyleDirective(text, span, 0, "#16a34a")).toBe(
      "flowchart TD\n  A --> B\n  linkStyle 0 stroke:#16a34a\n",
    );
  });
  it("removes a linkStyle line entirely", () => {
    const text = "flowchart TD\n  A --> B\n  linkStyle 0 stroke:#f00\n";
    const start = text.indexOf("linkStyle");
    const span = { start, end: text.indexOf("\n", start) };
    expect(removeLinkStyleDirective(text, span)).toBe("flowchart TD\n  A --> B\n");
  });
});
