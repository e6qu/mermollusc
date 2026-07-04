import { describe, expect, it } from "vitest";
import { isOk } from "@m/std";
import { print } from "../../src/core/print.js";
import { parse } from "../../src/shell/parse.js";

// The parser must ACCEPT Mermaid styling directives (previously they failed to parse, so pasting real
// Mermaid with colours broke), capture them on the AST, and PRINT them back so an edit never silently
// drops a style line (print→parse is a fixed point).

describe("style directive parsing", () => {
  const cases: [string, string][] = [
    ["style", "flowchart TD\n  A --> B\n  style A fill:#f9f,stroke:#333\n"],
    ["classDef+class", "flowchart TD\n  A --> B\n  classDef hot fill:#f96\n  class A hot\n"],
    ["linkStyle", "flowchart TD\n  A --> B\n  linkStyle 0 stroke:#f00\n"],
    ["class multi", "flowchart TD\n  A --> B\n  class A,B hot\n"],
  ];
  for (const [name, src] of cases) {
    it(`accepts and keeps the graph intact: ${name}`, () => {
      const r = parse(src);
      expect(isOk(r), JSON.stringify(r)).toBe(true);
      if (!isOk(r)) return;
      // the directive doesn't leak into the node set — only A and B are real nodes
      expect(r.value.nodes.map((n) => n.id).sort()).toEqual(["A", "B"]);
      expect(r.value.styles.length).toBeGreaterThan(0);
    });
  }

  it("does NOT swallow a node ref that merely starts with a directive keyword", () => {
    const r = parse("flowchart TD\n  style --> B\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.nodes.map((n) => n.id).sort()).toEqual(["B", "style"]);
    expect(r.value.styles).toHaveLength(0);
  });

  it("preserves every directive through print→parse (no silent loss)", () => {
    const src =
      "flowchart TD\n  A --> B\n  style A fill:#f9f,stroke:#333\n  classDef hot fill:#f96\n  class B hot\n  linkStyle 0 stroke:#f00\n";
    const first = parse(src);
    expect(isOk(first)).toBe(true);
    if (!isOk(first)) return;
    expect(first.value.styles.map((s) => s.kind)).toEqual([
      "style",
      "classDef",
      "class",
      "linkStyle",
    ]);
    const printed = print(first.value);
    const second = parse(printed);
    expect(isOk(second)).toBe(true);
    if (!isOk(second)) return;
    // print is a fixed point — reprinting the reparsed AST yields the same text
    expect(print(second.value)).toBe(printed);
    expect(second.value.styles).toEqual(first.value.styles);
  });
});
