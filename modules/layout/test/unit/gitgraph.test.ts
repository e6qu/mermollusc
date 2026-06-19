import { brand } from "@m/std";
import type { GitGraphAst } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutGitGraph } from "../../src/core/gitgraph.js";

const cid = (s: string) => brand<string, "GitCommitId">(s);
const bn = (s: string) => brand<string, "GitBranchName">(s);

// main: c0 ── c2 ── mc(merge)
//                \         /
// dev:            c1 ─────╯
const ast: GitGraphAst = {
  kind: "gitGraph",
  direction: "LR",
  branches: [
    { name: bn("main"), order: 0 },
    { name: bn("dev"), order: 1 },
  ],
  commits: [
    { id: cid("c0"), branch: bn("main"), parents: [], tag: null, commitType: "normal", merge: false },
    {
      id: cid("c1"),
      branch: bn("dev"),
      parents: [cid("c0")],
      tag: null,
      commitType: "normal",
      merge: false,
    },
    {
      id: cid("c2"),
      branch: bn("main"),
      parents: [cid("c0")],
      tag: null,
      commitType: "normal",
      merge: false,
    },
    {
      id: cid("mc"),
      branch: bn("main"),
      parents: [cid("c2"), cid("c1")],
      tag: null,
      commitType: "normal",
      merge: true,
    },
  ],
};

describe("layoutGitGraph", () => {
  const result = layoutGitGraph(ast, heuristicMeasure);
  if (!result.ok) throw new Error(result.error.message);
  const scene = result.value;

  const node = (id: string) => scene.nodes.find((n) => n.id === id);
  const ox = (id: string): number => node(id)?.bounds.origin.x ?? 0;
  const oy = (id: string): number => node(id)?.bounds.origin.y ?? 0;
  const hasEdge = (id: string): boolean => scene.edges.some((e) => e.id === id);

  it("emits a branch-head node per branch plus a node per commit", () => {
    expect(node("branch:main")).toBeDefined();
    expect(node("branch:dev")).toBeDefined();
    expect(scene.nodes.filter((n) => !n.id.startsWith("branch:")).map((n) => n.id)).toEqual([
      "c0",
      "c1",
      "c2",
      "mc",
    ]);
  });

  it("marches commits along the main axis in creation order (LR ⇒ increasing x)", () => {
    expect(ox("c1")).toBeGreaterThan(ox("c0"));
    expect(ox("c2")).toBeGreaterThan(ox("c1"));
    expect(ox("mc")).toBeGreaterThan(ox("c2"));
  });

  it("puts each branch's commits on its own lane (LR ⇒ distinct y)", () => {
    expect(oy("c1")).toBeGreaterThan(oy("c0"));
    expect(oy("c2")).toBe(oy("c0"));
  });

  it("draws commits as rounded pills (sized to the label) and a highlight commit as a rect", () => {
    expect(node("c0")?.shape).toBe("round");
    // the pill is wide enough to hold its label, not a fixed tiny dot
    expect((node("c0")?.bounds.size.width ?? 0) > 24).toBe(true);
    const hl = layoutGitGraph(
      {
        ...ast,
        commits: [
          {
            id: cid("h"),
            branch: bn("main"),
            parents: [],
            tag: null,
            commitType: "highlight",
            merge: false,
          },
        ],
      },
      heuristicMeasure,
    );
    if (!hl.ok) throw new Error(hl.error.message);
    expect(hl.value.nodes.find((n) => n.id === "h")?.shape).toBe("rect");
  });

  it("connects every commit to each of its parents", () => {
    expect(hasEdge("c0->c1")).toBe(true);
    expect(hasEdge("c0->c2")).toBe(true);
    // the merge commit fans in from both parents
    expect(hasEdge("c2->mc")).toBe(true);
    expect(hasEdge("c1->mc")).toBe(true);
  });

  it("lays out TB by swapping the axes (commits grow in y, lanes in x)", () => {
    const tb = layoutGitGraph({ ...ast, direction: "TB" }, heuristicMeasure);
    if (!tb.ok) throw new Error(tb.error.message);
    const n = (id: string) => tb.value.nodes.find((x) => x.id === id);
    expect((n("c2")?.bounds.origin.y ?? 0) > (n("c0")?.bounds.origin.y ?? 0)).toBe(true);
    expect((n("c1")?.bounds.origin.x ?? 0) > (n("c0")?.bounds.origin.x ?? 0)).toBe(true);
  });
});
