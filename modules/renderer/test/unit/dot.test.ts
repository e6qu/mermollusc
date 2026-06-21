import { brand, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { toDot } from "../../src/core/dot.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const node = (
  id: string,
  label: string,
  shape: Scene["nodes"][number]["shape"],
): Scene["nodes"][number] => ({
  id: snid(id),
  bounds: rect(0, 0, 60, 40),
  label,
  shape,
  parent: null,
  icon: null,
  rows: null,
  rowDivider: null,
  subtitle: null,
  accent: "none",
});

describe("toDot", () => {
  it("serialises nodes (with mapped shapes) and arrowed edges", () => {
    const scene: Scene = {
      nodes: [node("a", "Start", "rect"), node("b", "End", "round")],
      edges: [
        {
          id: seid("e0"),
          from: snid("a"),
          to: snid("b"),
          waypoints: [point(0, 0), point(10, 10)],
          label: "go",
          stroke: "solid",
          fromEnd: "none",
          toEnd: "arrow",
          curved: false,
          fromLabel: null,
          toLabel: null,
        },
      ],
      wedges: [],
      decorations: [], extent: rect(0, 0, 100, 100),
    };
    const dot = toDot(scene, null);
    expect(dot.startsWith("digraph {")).toBe(true);
    expect(dot).toContain('"a" [label="Start", shape=box];');
    expect(dot).toContain('"b" [label="End", shape=box, style="rounded"];');
    // `arrow` is DOT's default head, so no arrowhead attribute is emitted.
    expect(dot).toContain('"a" -> "b" [label="go"];');
    expect(dot.trimEnd().endsWith("}")).toBe(true);
  });

  it("maps a dashed, arrowless edge and a UML triangle head", () => {
    const scene: Scene = {
      nodes: [node("a", "A", "rect"), node("b", "B", "rect")],
      edges: [
        {
          id: seid("e0"),
          from: snid("a"),
          to: snid("b"),
          waypoints: [point(0, 0), point(1, 1)],
          label: null,
          stroke: "dashed",
          fromEnd: "none",
          toEnd: "triangle",
          curved: false,
          fromLabel: null,
          toLabel: null,
        },
      ],
      wedges: [],
      decorations: [], extent: rect(0, 0, 100, 100),
    };
    const dot = toDot(scene, null);
    expect(dot).toContain('style="dashed"');
    expect(dot).toContain("arrowhead=onormal");
  });

  it("escapes quotes and newlines in ids and labels", () => {
    const scene: Scene = {
      nodes: [node('a"x', 'two\nlines', "rect")],
      edges: [],
      wedges: [],
      decorations: [], extent: rect(0, 0, 100, 100),
    };
    const dot = toDot(scene, null);
    expect(dot).toContain('"a\\"x"');
    expect(dot).toContain("two\\nlines");
  });

  it("exports an empty graph for a node-less scene (e.g. a pie)", () => {
    const scene: Scene = { nodes: [], edges: [], wedges: [], decorations: [], extent: rect(0, 0, 10, 10) };
    expect(toDot(scene, null)).toBe("digraph {\n}\n");
  });

  it("emits rankdir when a direction is given, and omits it for null", () => {
    const scene: Scene = { nodes: [], edges: [], wedges: [], decorations: [], extent: rect(0, 0, 10, 10) };
    expect(toDot(scene, "LR")).toContain("rankdir=LR");
    expect(toDot(scene, null)).not.toContain("rankdir");
  });

  it("re-emits a container node as a cluster subgraph with its members nested", () => {
    const scene: Scene = {
      nodes: [
        { ...node("b", "Backend", "container"), parent: null },
        { ...node("api", "API", "rect"), parent: snid("b") },
        { ...node("db", "DB", "rect"), parent: snid("b") },
        node("web", "Web", "rect"),
      ],
      edges: [],
      wedges: [],
      decorations: [], extent: rect(0, 0, 100, 100),
    };
    const dot = toDot(scene, null);
    expect(dot).toContain('subgraph "cluster_b" {');
    expect(dot).toContain('label="Backend"');
    // members appear after the cluster opens, before its close
    const open = dot.indexOf('subgraph "cluster_b"');
    const close = dot.indexOf("}", open);
    expect(dot.indexOf('"api"')).toBeGreaterThan(open);
    expect(dot.indexOf('"api"')).toBeLessThan(close);
    // a node outside the cluster stays at top level
    expect(dot.indexOf('"web"')).toBeGreaterThan(close);
  });
});
