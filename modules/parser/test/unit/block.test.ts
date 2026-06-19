import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseBlock, parseBlockWithSource } from "../../src/shell/block-parse.js";

const nid = (s: string) => brand<string, "NodeId">(s);
const eid = (s: string) => brand<string, "EdgeId">(s);

describe("parseBlock", () => {
  it("parses block declarations with shapes, a columns directive, and edges", () => {
    const text = 'block-beta\n  columns 2\n  a["Web"]\n  b(API)\n  c\n  a --> b\n';
    const r = parseBlock(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    expect(r.value.kind).toBe("block");
    expect(r.value.columns).toBe(2);
    expect(r.value.blocks.map((b) => [b.id, b.label, b.shape])).toEqual([
      ["a", "Web", "rect"],
      ["b", "API", "round"],
      ["c", "c", "rect"],
    ]);
    expect(r.value.edges).toHaveLength(1);
    expect(r.value.edges[0]?.from).toBe("a");
    expect(r.value.edges[0]?.to).toBe("b");
    expect(r.value.edges[0]?.kind).toBe("arrow");
  });

  it("defaults columns to a single row when the directive is omitted", () => {
    const r = parseBlock("block-beta\n  a b c\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.blocks).toHaveLength(3);
    expect(r.value.columns).toBe(3);
  });

  it("parses a per-block icon override", () => {
    const r = parseBlock('block-beta\n  a["Web"] icon "devicon/docker"\n  b\n');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const byId = new Map(r.value.blocks.map((b) => [b.id, b]));
    expect(byId.get(nid("a"))?.label).toBe("Web");
    expect(byId.get(nid("a"))?.icon).toEqual({ pack: "devicon", name: "docker" });
    expect(byId.get(nid("b"))?.icon).toBeNull();
  });

  it("fails loudly on a malformed icon reference", () => {
    const r = parseBlock('block-beta\n  a["Web"] icon "bogus"\n');
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    expect(r.error.errors[0]).toMatch(/malformed icon reference/);
  });

  it("keeps a dotted-link edge label", () => {
    const r = parseBlock("block-beta\n  a -.->|maybe| b\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.edges[0]?.kind).toBe("dotted");
    expect(r.value.edges[0]?.label).toBe("maybe");
  });
});

describe("parseBlockWithSource", () => {
  it("captures the label span of a block (inside the quotes) and an edge label span", () => {
    const text = 'block-beta\n  a["Web"]\n  a -->|calls| b\n';
    const r = parseBlockWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;

    const block = r.value.source.blocks.get(nid("a"));
    expect(block).toBeDefined();
    if (block !== undefined) expect(text.slice(block.start, block.end)).toBe("Web");

    const edge = r.value.source.edges.get(eid("e0"));
    expect(edge).toBeDefined();
    if (edge !== undefined) expect(text.slice(edge.start, edge.end)).toBe("calls");
  });

  it("captures an unquoted bracket label without the quotes heuristic", () => {
    const text = "block-beta\n  a[Plain]\n";
    const r = parseBlockWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const block = r.value.source.blocks.get(nid("a"));
    expect(block).toBeDefined();
    if (block !== undefined) expect(text.slice(block.start, block.end)).toBe("Plain");
  });

  it("records no span for a bare block", () => {
    const r = parseBlockWithSource("block-beta\n  a b\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.source.blocks.get(nid("a"))).toBeUndefined();
  });

  it("strips quotes from a quoted pipe edge label (matching node labels + the edge span)", () => {
    const text = 'block-beta\n  a -->|"go"| b\n';
    const r = parseBlockWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ast.edges[0]?.label).toBe("go");
    const span = r.value.source.edges.get(eid("e0"));
    expect(span).toBeDefined();
    // the span covers the inner text (no quotes), consistent with the stored label
    if (span !== undefined) expect(text.slice(span.start, span.end)).toBe("go");
  });
});
