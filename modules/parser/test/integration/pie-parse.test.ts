import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parsePie, parsePieWithSource } from "../../src/shell/pie-parse.js";

const sid = (s: string) => brand<string, "PieSliceId">(s);

describe("parsePie", () => {
  it("parses the title and slices in source order", () => {
    const text = 'pie\n  title Pets\n  "Dogs" : 386\n  "Cats" : 85.5\n';
    const r = parsePie(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.title).toBe("Pets");
    expect(r.value.showData).toBe(false);
    expect(r.value.slices).toEqual([
      { id: sid("s0"), label: "Dogs", value: 386 },
      { id: sid("s1"), label: "Cats", value: 85.5 },
    ]);
  });

  it("reads the showData modifier on the header", () => {
    const r = parsePie('pie showData\n  "A" : 1\n');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.showData).toBe(true);
    expect(r.value.donut).toBe(false);
  });

  it("reads the donut modifier on the header", () => {
    const r = parsePie('pie donut showData\n  "A" : 1\n');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.donut).toBe(true);
    expect(r.value.showData).toBe(true);
  });

  it("parses with no title", () => {
    const r = parsePie('pie\n  "A" : 1\n  "B" : 2\n');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.title).toBeNull();
    expect(r.value.slices).toHaveLength(2);
  });

  it("records each slice's label span for relabel", () => {
    const text = 'pie\n  "Dogs" : 386\n';
    const r = parsePieWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const span = r.value.source.slices.get(sid("s0"));
    expect(span).toBeDefined();
    if (span !== undefined) expect(text.slice(span.start, span.end)).toBe("Dogs");
  });

  it("fails loudly on a zero or negative slice value", () => {
    expect(isOk(parsePie('pie\n  "A" : 0\n'))).toBe(false);
    // A leading `-` isn't a numeric literal, so the lexer rejects it.
    expect(isOk(parsePie('pie\n  "A" : -5\n'))).toBe(false);
  });
});
