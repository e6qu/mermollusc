import { brand, point, rect } from "@m/std";
import type { Scene } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { toDot } from "../../src/core/dot.js";

const snid = (s: string) => brand<string, "SceneNodeId">(s);
const seid = (s: string) => brand<string, "SceneEdgeId">(s);

const node = (id: string, label: string, shape: Scene["nodes"][number]["shape"]) => ({
  id: snid(id),
  bounds: rect(0, 0, 60, 40),
  label,
  shape,
  parent: null,
  icon: null,
  rows: null,
  rowDivider: null,
  subtitle: null,
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
        },
      ],
      wedges: [],
      extent: rect(0, 0, 100, 100),
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
        },
      ],
      wedges: [],
      extent: rect(0, 0, 100, 100),
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
      extent: rect(0, 0, 100, 100),
    };
    const dot = toDot(scene, null);
    expect(dot).toContain('"a\\"x"');
    expect(dot).toContain("two\\nlines");
  });

  it("exports an empty graph for a node-less scene (e.g. a pie)", () => {
    const scene: Scene = { nodes: [], edges: [], wedges: [], extent: rect(0, 0, 10, 10) };
    expect(toDot(scene, null)).toBe("digraph {\n}\n");
  });

  it("emits rankdir when a direction is given, and omits it for null", () => {
    const scene: Scene = { nodes: [], edges: [], wedges: [], extent: rect(0, 0, 10, 10) };
    expect(toDot(scene, "LR")).toContain("rankdir=LR");
    expect(toDot(scene, null)).not.toContain("rankdir");
  });
});
