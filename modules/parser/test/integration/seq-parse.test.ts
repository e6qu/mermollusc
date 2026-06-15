import { isErr, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseSequence } from "../../src/shell/seq-parse.js";

describe("parseSequence", () => {
  it("parses participants and messages", () => {
    const r = parseSequence(
      "sequenceDiagram\n  participant A as Alice\n  A->>B: Hello\n  B-->>A: Hi there\n",
    );
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const ast = r.value;
    expect(ast.kind).toBe("sequence");
    // A declared with a label; B inferred from the message
    expect(ast.actors.map((a) => [a.id, a.label])).toEqual([
      ["A", "Alice"],
      ["B", "B"],
    ]);
    expect(ast.messages).toHaveLength(2);
    expect(ast.messages[0]).toMatchObject({ from: "A", to: "B", text: "Hello", kind: "solid" });
    expect(ast.messages[1]).toMatchObject({ from: "B", to: "A", text: "Hi there", kind: "dashed" });
  });

  it("classifies the four arrow kinds", () => {
    const r = parseSequence("sequenceDiagram\n  A->>B: a\n  A-->>B: b\n  A->B: c\n  A-->B: d\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.messages.map((m) => m.kind)).toEqual(["solid", "dashed", "solidOpen", "dashedOpen"]);
  });

  it("fails loudly on a malformed message", () => {
    expect(isErr(parseSequence("sequenceDiagram\n  A->>\n"))).toBe(true);
  });
});
