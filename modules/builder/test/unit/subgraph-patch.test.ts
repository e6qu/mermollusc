import { brand } from "@m/std";
import type { TextSpan } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { removeSubgraphBlock, wrapFlowchartSubgraph } from "../../src/core/patch.js";

const nid = (s: string) => brand<string, "NodeId">(s);

describe("flowchart subgraph patches", () => {
  it("inserts a subgraph block after the header, listing members before the edges", () => {
    const out = wrapFlowchartSubgraph(
      "flowchart TD\n  A --> B\n  B --> C\n",
      [nid("A"), nid("B")],
      "group1",
      "Group",
    );
    expect(out).toBe(
      "flowchart TD\n  subgraph group1[Group]\n    A\n    B\n  end\n  A --> B\n  B --> C\n",
    );
  });

  it("needs at least two members", () => {
    const text = "flowchart TD\n  A --> B\n";
    expect(wrapFlowchartSubgraph(text, [nid("A")], "group1", "Group")).toBe(text);
  });

  it("removes a subgraph block by its span (indent + trailing newline)", () => {
    const text = "flowchart TD\n  subgraph group1[Group]\n    A\n    B\n  end\n  A --> B\n";
    const start = text.indexOf("subgraph");
    const span: TextSpan = { start, end: text.indexOf("end", start) + 3 };
    expect(removeSubgraphBlock(text, span)).toBe("flowchart TD\n  A --> B\n");
  });
});
