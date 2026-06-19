import { brand, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { parseGitGraph, parseGitGraphWithSource } from "../../src/shell/git-parse.js";

const cid = (s: string) => brand<string, "GitCommitId">(s);

describe("parseGitGraph", () => {
  it("auto-ids commits and chains each to the previous tip on main", () => {
    const r = parseGitGraph("gitGraph\n  commit\n  commit\n  commit\n");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.commits.map((c) => c.id)).toEqual([cid("c0"), cid("c1"), cid("c2")]);
    expect(r.value.commits.map((c) => c.parents)).toEqual([[], [cid("c0")], [cid("c1")]]);
    expect(r.value.commits.every((c) => c.branch === "main")).toBe(true);
    expect(r.value.branches).toEqual([{ name: "main", order: 0 }]);
  });

  it("branch auto-checks-out, assigns a new lane, and forks from the current tip", () => {
    const text = `gitGraph
  commit id: "root"
  branch develop
  commit id: "d1"
`;
    const r = parseGitGraph(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.branches).toEqual([
      { name: "main", order: 0 },
      { name: "develop", order: 1 },
    ]);
    const d1 = r.value.commits.find((c) => c.id === "d1");
    // `branch develop` checked out develop, so `d1` lands on develop and forks from main's tip `root`.
    expect(d1?.branch).toBe("develop");
    expect(d1?.parents).toEqual([cid("root")]);
  });

  it("merge creates a two-parent merge commit on the current branch", () => {
    const text = `gitGraph
  commit id: "m1"
  branch feature
  commit id: "f1"
  checkout main
  commit id: "m2"
  merge feature id: "mc"
`;
    const r = parseGitGraph(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const mc = r.value.commits.find((c) => c.id === "mc");
    expect(mc?.merge).toBe(true);
    expect(mc?.branch).toBe("main");
    // Parents: the current (main) tip `m2`, then the merged (feature) tip `f1`.
    expect(mc?.parents).toEqual([cid("m2"), cid("f1")]);
  });

  it("reads the header direction (LR default, explicit TB)", () => {
    const lr = parseGitGraph("gitGraph\n  commit\n");
    const tb = parseGitGraph("gitGraph TB:\n  commit\n");
    expect(isOk(lr) && lr.value.direction).toBe("LR");
    expect(isOk(tb) && tb.value.direction).toBe("TB");
  });

  it("parses commit type and tag", () => {
    const r = parseGitGraph('gitGraph\n  commit tag: "v1.0" type: HIGHLIGHT\n');
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.commits[0]).toMatchObject({ tag: "v1.0", commitType: "highlight" });
  });

  it("records the explicit-id span so a commit can be relabelled inline", () => {
    const text = 'gitGraph\n  commit id: "Alpha"\n';
    const r = parseGitGraphWithSource(text);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const span = r.value.source.commits.get(cid("Alpha"));
    expect(span).toBeDefined();
    if (span !== undefined) expect(text.slice(span.start, span.end)).toBe("Alpha");
  });

  it("fails loudly on checkout/merge of an unknown branch", () => {
    expect(isOk(parseGitGraph("gitGraph\n  checkout ghost\n"))).toBe(false);
    expect(isOk(parseGitGraph("gitGraph\n  commit\n  merge ghost\n"))).toBe(false);
  });

  it("fails loudly on a duplicate explicit commit id and a self-merge", () => {
    expect(isOk(parseGitGraph('gitGraph\n  commit id: "x"\n  commit id: "x"\n'))).toBe(false);
    expect(isOk(parseGitGraph("gitGraph\n  commit\n  merge main\n"))).toBe(false);
  });
});
