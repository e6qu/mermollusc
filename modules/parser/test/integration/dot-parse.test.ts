import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseDot } from "../../src/shell/dot-parse.js";
import { parseDiagram } from "../../src/shell/diagram.js";

const nid = (s: string) => brand<string, "NodeId">(s);

describe("parseDot", () => {
  it("imports a digraph as a flowchart with arrowed edges", () => {
    const r = parseDot("digraph G {\n  a -> b\n  b -> c\n}\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.kind).toBe("flowchart");
    expect(r.value.nodes.map((n) => n.id)).toEqual([nid("a"), nid("b"), nid("c")]);
    expect(r.value.edges.map((e) => [e.from, e.to, e.kind])).toEqual([
      [nid("a"), nid("b"), "arrow"],
      [nid("b"), nid("c"), "arrow"],
    ]);
  });

  it("expands an edge chain a -> b -> c into consecutive edges", () => {
    const r = parseDot("digraph { a -> b -> c -> d }");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.edges).toHaveLength(3);
  });

  it("imports an undirected graph with arrowless edges", () => {
    const r = parseDot("graph { a -- b }");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.edges[0]?.kind).toBe("open");
  });

  it("reads node label/shape attributes and edge labels", () => {
    const r = parseDot('digraph {\n  a [label="Start" shape=box]\n  a -> b [label="go"]\n}');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const a = r.value.nodes.find((n) => n.id === "a");
    expect(a?.label).toBe("Start");
    expect(a?.shape).toBe("rect");
    expect(r.value.edges[0]?.label).toBe("go");
  });

  it("applies a `node [shape=...]` default to later nodes", () => {
    const r = parseDot("digraph {\n  node [shape=diamond]\n  a -> b\n}");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.nodes.every((n) => n.shape === "diamond")).toBe(true);
  });

  it("honours rankdir (both `rankdir=LR` and `graph [rankdir=LR]`)", () => {
    const a = parseDot("digraph { rankdir=LR\n a -> b }");
    const b = parseDot("digraph { graph [rankdir=LR]\n a -> b }");
    expect(isOk(a) && a.value.direction).toBe("LR");
    expect(isOk(b) && b.value.direction).toBe("LR");
  });

  it("skips comments and tolerates quoted ids with spaces", () => {
    const r = parseDot('digraph {\n  // a comment\n  "node one" -> "node two"\n  /* block */ }');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.nodes.map((n) => n.label)).toEqual(["node one", "node two"]);
  });

  it("fails loudly on an unterminated graph", () => {
    expect(isOk(parseDot("digraph { a -> b"))).toBe(false);
  });

  it("routes via parseDiagram for digraph and brace-carrying graph, but not Mermaid `graph TD`", () => {
    expect(isOk(parseDiagram("digraph { a -> b }"))).toBe(true);
    expect(isOk(parseDiagram("graph { a -- b }"))).toBe(true);
    // Mermaid flowchart with a decision node — must NOT be taken as DOT despite the `{`.
    const mermaid = parseDiagram("graph TD\n  A --> B{Choice}\n");
    expect(isOk(mermaid)).toBe(true);
    if (isOk(mermaid)) expect(mermaid.value.kind).toBe("flowchart");
  });
});
