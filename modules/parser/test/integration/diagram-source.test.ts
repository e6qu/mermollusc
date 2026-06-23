import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseDiagram, parseDiagramWithSource } from "../../src/shell/diagram.js";

// One representative source per family, with the `family` tag the consumer switches on. `dot` and
// `flowchart` deliberately share `ast.kind === "flowchart"` — only `family` tells them apart.
const cases: ReadonlyArray<readonly [family: string, kind: string, text: string]> = [
  ["flowchart", "flowchart", "flowchart TD\n  A[Start] --> B(End)\n"],
  ["dot", "flowchart", "digraph G {\n  a -> b\n}\n"],
  ["sequence", "sequence", "sequenceDiagram\n  A->>B: hi\n"],
  ["c4", "c4", 'C4Context\n  Person(a, "A")\n'],
  ["block", "block", "block-beta\n  a[\"A\"]\n"],
  ["network", "network", 'network\n  server s1 "S1"\n'],
  ["cloud", "cloud", 'cloud\n  compute c1 "C1"\n'],
  ["state", "state", "stateDiagram-v2\n  [*] --> A\n  A --> [*]\n"],
  ["er", "er", "erDiagram\n  A ||--o{ B : has\n"],
  ["class", "class", "classDiagram\n  class Foo\n  Foo : +int id\n"],
  ["requirement", "requirement", "requirementDiagram\n  requirement r {\n  id: 1\n  }\n"],
  ["gitGraph", "gitGraph", "gitGraph\n  commit\n  commit\n"],
  ["timeline", "timeline", "timeline\n  title T\n  2021 : a\n"],
  ["mindmap", "mindmap", "mindmap\n  root\n    child\n"],
  ["pie", "pie", 'pie\n  "A" : 1\n  "B" : 2\n'],
  ["gantt", "gantt", "gantt\n  title G\n  a : 2021-01-01, 2d\n"],
];

describe("parseDiagramWithSource", () => {
  for (const [family, kind, text] of cases) {
    it(`tags ${family} and yields the same ast as parseDiagram (one pass, source kept)`, () => {
      const withSource = parseDiagramWithSource(text);
      const astOnly = parseDiagram(text);
      expect(isOk(withSource)).toBe(true);
      expect(isOk(astOnly)).toBe(true);
      if (!isOk(withSource) || !isOk(astOnly)) return;
      expect(withSource.value.family).toBe(family);
      // The discriminator distinguishes dot from flowchart even though both ASTs are flowcharts.
      expect(withSource.value.ast.kind).toBe(kind);
      // Same AST as the ast-only route — the source is added, not the ast mapped away.
      expect(withSource.value.ast).toEqual(astOnly.value);
      // A source is always present (DOT carries an empty SourceMap; every other family its real spans).
      expect(withSource.value.source).toBeDefined();
    });
  }

  it("dot and flowchart are distinguishable only by `family` (both ast.kind flowchart)", () => {
    const dot = parseDiagramWithSource("digraph G {\n  a -> b\n}\n");
    const flow = parseDiagramWithSource("flowchart TD\n  a --> b\n");
    expect(isOk(dot)).toBe(true);
    expect(isOk(flow)).toBe(true);
    if (!isOk(dot) || !isOk(flow)) return;
    expect(dot.value.ast.kind).toBe("flowchart");
    expect(flow.value.ast.kind).toBe("flowchart");
    expect(dot.value.family).toBe("dot");
    expect(flow.value.family).toBe("flowchart");
  });

  it("carries the flowchart label spans the inline editor patches", () => {
    const text = "flowchart TD\n  A[Start] --> B(End)\n";
    const r = parseDiagramWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r) || r.value.family !== "flowchart") return;
    const span = [...r.value.source.nodes.values()][0]?.label;
    expect(span).toBeDefined();
    if (span !== undefined) expect(text.slice(span.start, span.end)).toBe("Start");
  });

  it("fails loudly (Result err) — never throws — on a malformed body", () => {
    const r = parseDiagramWithSource("flowchart TD\n  A -->\n");
    expect(isOk(r)).toBe(false);
  });
});
