import { brand } from "@m/std";
import type { TextSpan } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { reconnectEdgeEnd } from "../../src/core/patch.js";

const nid = (s: string) => brand<string, "NodeId">(s);

describe("reconnectEdgeEnd", () => {
  it("rewrites an endpoint declaration span to a new node id", () => {
    const text = "flowchart LR\n  A[A] --> B[B]\n  A --> C[C]\n";
    const start = text.indexOf("B[B]");
    const span: TextSpan = { start, end: start + "B[B]".length };
    expect(reconnectEdgeEnd(text, span, nid("C"))).toBe("flowchart LR\n  A[A] --> C\n  A --> C[C]\n");
  });

  it("rewrites the from-end (a bare id) too", () => {
    const text = "flowchart LR\n  A --> B\n";
    const span: TextSpan = { start: text.indexOf("A"), end: text.indexOf("A") + 1 };
    expect(reconnectEdgeEnd(text, span, nid("X"))).toBe("flowchart LR\n  X --> B\n");
  });
});
