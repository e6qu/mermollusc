import { brand, isErr, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseSequence, parseSequenceWithSource } from "../../src/shell/seq-parse.js";

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

  it("parses notes (over single, over span, left/right of) with interleave positions", () => {
    const r = parseSequence(
      "sequenceDiagram\n  A->>B: one\n  note over A: think\n  note over A,B: chat\n  B-->>A: two\n  note left of A: aside\n",
    );
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(
      r.value.notes.map((n) => `${n.side}|${n.targets.join(",")}|${n.text}|${n.after}`),
    ).toEqual(["over|A|think|1", "over|A,B|chat|1", "left|A|aside|2"]);
  });

  it("captures a note's text span for two-way editing", () => {
    const text = "sequenceDiagram\n  A->>B: hi\n  note over A,B: shared state\n";
    const r = parseSequenceWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const span = r.value.source.notes.get(brand<string, "SequenceNoteId">("note0"));
    expect(span).toBeDefined();
    if (span !== undefined) expect(text.slice(span.start, span.end)).toBe("shared state");
  });

  it("captures message text and actor label spans", () => {
    const text = "sequenceDiagram\n  participant A as Alice\n  A->>B: Hello\n";
    const r = parseSequenceWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const message = r.value.source.messages.get(brand<string, "MessageId">("m0"));
    expect(message).toBeDefined();
    if (message !== undefined) expect(text.slice(message.start, message.end)).toBe("Hello");

    const actor = r.value.source.actors.get(brand<string, "ActorId">("A"));
    expect(actor).toBeDefined();
    if (actor !== undefined) expect(text.slice(actor.start, actor.end)).toBe("Alice");
  });
});
