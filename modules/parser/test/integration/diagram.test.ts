import fc from "fast-check";
import { isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { firstMeaningfulLine, parseDiagram } from "../../src/shell/diagram.js";

// The original `split/map/find` the forward scan replaced.
const oldHeader = (text: string): string =>
  text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("%%")) ?? "";

describe("parseDiagram", () => {
  it("routes flowchart headers", () => {
    const r = parseDiagram("flowchart TD\n  A --> B\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.kind).toBe("flowchart");
  });

  it("routes sequenceDiagram headers", () => {
    const r = parseDiagram("sequenceDiagram\n  A->>B: hi\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.kind).toBe("sequence");
  });

  it("routes C4 headers", () => {
    const r = parseDiagram('C4Context\n  Person(a, "A")\n');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.kind).toBe("c4");
  });

  it("skips leading comments/blanks when sniffing", () => {
    const r = parseDiagram("\n%% a note\nsequenceDiagram\n  A->>B: hi\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.kind).toBe("sequence");
  });
});

describe("firstMeaningfulLine — parity with the old split/map/find", () => {
  it("matches on hand-picked headers (CRLF, comments, blank lines, no trailing newline)", () => {
    for (const t of [
      "",
      "\n\n",
      "  flowchart TD  ",
      "\r\n%% c\r\n  sequenceDiagram \r\n A->>B: hi",
      "%%only a comment",
      "%% c\n\n  graph LR\nA-->B",
      "\t mindmap\n  root",
      "no-trailing-newline",
    ]) {
      expect(firstMeaningfulLine(t)).toBe(oldHeader(t));
    }
  });

  it("matches the old logic on arbitrary inputs (property-based)", () => {
    // A line alphabet that exercises the meaningful/blank/`%%`-comment/`\r` cases the sniff cares about.
    const line = fc
      .array(fc.constantFrom(..."ab %\r\t"), { maxLength: 8 })
      .map((cs) => cs.join(""));
    const doc = fc.array(line, { maxLength: 12 }).map((ls) => ls.join("\n"));
    fc.assert(
      fc.property(doc, (text) => {
        expect(firstMeaningfulLine(text)).toBe(oldHeader(text));
      }),
    );
  });
});
