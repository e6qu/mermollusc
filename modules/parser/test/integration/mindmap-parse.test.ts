import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseMindmap, parseMindmapWithSource } from "../../src/shell/mindmap-parse.js";

const nid = (s: string) => brand<string, "MindmapNodeId">(s);

describe("parseMindmap", () => {
  it("builds the tree from indentation depth", () => {
    const text = "mindmap\n  Root\n    A\n      B\n    C\n";
    const r = parseMindmap(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.nodes.map((n) => [n.label, n.parent, n.level])).toEqual([
      ["Root", null, 0],
      ["A", nid("n0"), 1],
      ["B", nid("n1"), 2],
      ["C", nid("n0"), 1],
    ]);
  });

  it("reads each node's shape from its delimiter", () => {
    const text =
      "mindmap\n  root((Center))\n    sq[Square]\n    rnd(Rounded)\n    hex{{Hexa}}\n    plain text\n";
    const r = parseMindmap(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.nodes.map((n) => [n.label, n.shape])).toEqual([
      ["Center", "circle"],
      ["Square", "square"],
      ["Rounded", "rounded"],
      ["Hexa", "hexagon"],
      ["plain text", "default"],
    ]);
  });

  it("strips `::icon(...)` and `:::class` decorations from the label", () => {
    const r = parseMindmap("mindmap\n  Root\n    Tools ::icon(fa fa-tools) :::urgent\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.nodes[1]?.label).toBe("Tools");
  });

  it("does not treat a deeper sibling as a child when it dedents", () => {
    const text = "mindmap\n  Root\n      Deep\n    Shallow\n";
    const r = parseMindmap(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    // Deep (col 7) is a child of Root; Shallow (col 5) dedents back under Root, not under Deep.
    expect(r.value.nodes.find((n) => n.label === "Shallow")?.parent).toBe(nid("n0"));
  });

  it("records the node label span for inline relabel", () => {
    const text = "mindmap\n  root[Root]\n";
    const r = parseMindmapWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const span = r.value.source.nodes.get(nid("n0"));
    expect(span).toBeDefined();
    if (span !== undefined) expect(text.slice(span.start, span.end)).toBe("Root");
  });

  it("parses an empty mindmap (header only) as a node-less AST", () => {
    const r = parseMindmap("mindmap\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.nodes).toEqual([]);
  });
});
