import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseDiagram } from "../../src/shell/diagram.js";

// Malformed / degenerate inputs per family. The contract is *fail loudly, never throw*: every one
// must return a `Result` (ok or err) — a thrown exception would crash the app's render loop.
const ODD_INPUTS: readonly string[] = [
  // Header-only (empty body) for each family.
  "flowchart TD\n",
  "sequenceDiagram\n",
  "C4Context\n",
  "block-beta\n",
  "network\n",
  "cloud\n",
  "stateDiagram-v2\n",
  "erDiagram\n",
  "classDiagram\n",
  "gitGraph\n",
  "timeline\n",
  "mindmap\n",
  "pie\n",
  "digraph {}\n",
  // Truncated / dangling relationships.
  "digraph { a ->",
  "digraph { a -> b",
  "graph { a -- }",
  "digraph { subgraph cluster { a } }",
  // Two subgraphs sharing an id, one nested in the other: the canonical-order `walk` recurses over an
  // id-keyed bucket and would loop forever without the on-path guard.
  "flowchart TD\n  subgraph X\n    subgraph X\n      a\n    end\n  end\n",
  "digraph G { subgraph cluster_x { subgraph cluster_x { a } } }",
  "stateDiagram-v2\n  note right of\n",
  "stateDiagram-v2\n  state x <<bogus>>\n",
  'classDiagram\n  A "1" -->\n',
  'pie\n  "A" : 0\n',
  'pie\n  "A" :\n',
  "pie showData\n",
  "mindmap\n      OnlyDeepNoRoot\n",
  "mindmap\n  a((unclosed\n",
  "mindmap\n  x :::class ::icon(fa fa-x)\n",
  "gitGraph\n  merge\n",
  "gitGraph\n  checkout\n",
  "gitGraph\n  branch\n",
  "timeline\n  : orphan event\n",
  "timeline\n  2002 :\n",
  "timeline\n  section\n  2002 : x\n",
  "classDiagram\n  A <|--\n",
  "classDiagram\n  class\n",
  "erDiagram\n  A ||--o{\n",
  "stateDiagram-v2\n  [*] -->\n",
  "flowchart TD\n  A --> \n",
  // Unclosed compartment blocks.
  "classDiagram\n  class A {\n  +int x\n",
  "erDiagram\n  A {\n  string n\n",
  // Lone keywords / punctuation.
  "classDiagram\n  {\n}\n",
  "erDiagram\n  }{ \n",
  // Self references and duplicate ids.
  "classDiagram\n  A --> A\n",
  "erDiagram\n  A ||--|| A\n",
  "flowchart TD\n  A --> A\n  A --> A\n",
  // Very long single token.
  `flowchart TD\n  A["${"x".repeat(5000)}"]\n`,
  // Unicode + emoji labels.
  "flowchart TD\n  A[日本語 🌊 café]\n",
  // Whitespace / comment only.
  "   \n%% just a comment\n",
  "",
];

describe("parseDiagram robustness", () => {
  it("never throws on malformed or degenerate input — always returns a Result", () => {
    for (const text of ODD_INPUTS) {
      expect(() => {
        const r = parseDiagram(text);
        expect(typeof isOk(r)).toBe("boolean");
      }, `input: ${JSON.stringify(text.slice(0, 40))}`).not.toThrow();
    }
  });

  it("parses an empty-body diagram of each family as a valid (possibly empty) AST", () => {
    const headers = [
      "classDiagram\n",
      "erDiagram\n",
      "stateDiagram-v2\n",
      "sequenceDiagram\n",
      "gitGraph\n",
      "timeline\n",
      "mindmap\n",
      "pie\n",
    ];
    for (const text of headers) {
      const r = parseDiagram(text);
      expect(isOk(r), `header: ${JSON.stringify(text)}`).toBe(true);
    }
  });
});
