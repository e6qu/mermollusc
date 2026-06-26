import { brand } from "@m/std";
import type { GitGraphAst } from "@m/contracts";
import { describe, expect, it } from "vitest";
import { heuristicMeasure } from "../../src/core/graph.js";
import { layoutGitGraph } from "../../src/core/gitgraph.js";
import { layoutEnergy } from "../../src/core/energy.js";
import { noSiblingOverlaps } from "../../src/core/invariants.js";

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

  it("labels commits with a deterministic short SHA, draws arrows, and a stickman per branch", () => {
    // commit labels read like abbreviated git SHAs (7 hex), and are stable across runs
    expect(node("c0")?.label).toMatch(/^[0-9a-f]{7}$/);
    const again = layoutGitGraph(ast, heuristicMeasure);
    if (!again.ok) throw new Error(again.error.message);
    expect(again.value.nodes.find((n) => n.id === "c0")?.label).toBe(node("c0")?.label);
    // every parent→child edge is a straight arrow (so the direction of history is explicit)
    expect(scene.edges.every((e) => e.toEnd === "arrow" && e.curved === false)).toBe(true);
    // each branch head is a stickman (the developer on that line)
    expect(node("branch:main")?.shape).toBe("actor");
    expect(node("branch:dev")?.shape).toBe("actor");
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

  // A 3-branch graph whose DECLARED lane order makes the `b`-merge cross the middle lane `a`. Tidy
  // permutes the lanes (main pinned to 0) and should pick an order that avoids that crossing.
  const crossing: GitGraphAst = {
    kind: "gitGraph",
    direction: "LR",
    branches: [
      { name: bn("main"), order: 0 },
      { name: bn("a"), order: 1 },
      { name: bn("b"), order: 2 },
    ],
    commits: [
      { id: cid("c0"), branch: bn("main"), parents: [], tag: null, commitType: "normal", merge: false },
      { id: cid("ca"), branch: bn("a"), parents: [cid("c0")], tag: null, commitType: "normal", merge: false },
      { id: cid("cb"), branch: bn("b"), parents: [cid("c0")], tag: null, commitType: "normal", merge: false },
      { id: cid("ca2"), branch: bn("a"), parents: [cid("ca")], tag: null, commitType: "normal", merge: false },
      { id: cid("mb"), branch: bn("main"), parents: [cid("c0"), cid("cb")], tag: null, commitType: "normal", merge: true },
    ],
  };

  it("tidy lane-ordering never worsens energy and stays in-style; it improves the crossing case", () => {
    const base = layoutGitGraph(crossing, heuristicMeasure, false);
    const tidy = layoutGitGraph(crossing, heuristicMeasure, true);
    if (!base.ok || !tidy.ok) throw new Error("layout failed");
    expect(noSiblingOverlaps(tidy.value)).toBe(true); // still a valid gitGraph
    const eb = layoutEnergy(base.value).total;
    const et = layoutEnergy(tidy.value).total;
    expect(et).toBeLessThanOrEqual(eb + 1e-6); // never worse (default is always a candidate)
    expect(et).toBeLessThan(eb); // and strictly better here — the b-merge no longer crosses lane a
  });

  it("uses barycenter lane ordering for many branches (>5) — strictly improves a mis-declared chain", () => {
    const co = (id: string, branch: string, parents: string[], merge = false) => ({
      id: cid(id), branch: bn(branch), parents: parents.map(cid),
      tag: null, commitType: "normal" as const, merge,
    });
    // A chain — a off main, b off a, c off b, d off c, e off d — but the branches are DECLARED in reverse
    // lane order, so the declared layout crosses. Barycenter (too many branches to brute-force) reorders
    // the lanes by adjacency and untangles it.
    const ast: GitGraphAst = {
      kind: "gitGraph",
      direction: "LR",
      branches: [
        { name: bn("main"), order: 0 }, { name: bn("e"), order: 1 }, { name: bn("d"), order: 2 },
        { name: bn("c"), order: 3 }, { name: bn("b"), order: 4 }, { name: bn("a"), order: 5 },
      ],
      commits: [
        co("c0", "main", []),
        co("a1", "a", ["c0"]), co("b1", "b", ["a1"]), co("c1", "c", ["b1"]),
        co("d1", "d", ["c1"]), co("e1", "e", ["d1"]),
        co("ma", "main", ["c0", "a1"], true),
      ],
    };
    const declared = layoutGitGraph(ast, heuristicMeasure, false);
    const tidy = layoutGitGraph(ast, heuristicMeasure, true);
    if (!declared.ok || !tidy.ok) throw new Error("layout failed");
    expect(ast.branches.length).toBeGreaterThan(5); // exercises the barycenter (non-brute-force) path
    expect(noSiblingOverlaps(tidy.value)).toBe(true); // still a valid gitGraph
    expect(layoutEnergy(tidy.value).crossings).toBeLessThan(layoutEnergy(declared.value).crossings);
  });

  it("leaves the declared order untouched when tidy is off (default output is stable)", () => {
    const off = layoutGitGraph(crossing, heuristicMeasure, false);
    const explicitOff = layoutGitGraph(crossing, heuristicMeasure);
    if (!off.ok || !explicitOff.ok) throw new Error("layout failed");
    expect(off.value).toEqual(explicitOff.value);
  });
});
