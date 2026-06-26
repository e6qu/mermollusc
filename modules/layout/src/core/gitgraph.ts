import { err, isOk, ok, point, rect, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
import type {
  GitBranchName,
  GitCommit,
  GitCommitId,
  GitGraphAst,
  NodeShape,
  Scene,
  SceneEdge,
  SceneNode,
} from "@m/contracts";
import { lowestEnergy } from "./energy.js";
import type { LayoutError, MeasureText } from "./graph.js";
import { styleOk } from "./invariants.js";

// Lane-order candidates for "Tidy": permute which lane each branch occupies (keeping the first branch —
// conventionally `main` — pinned to lane 0), so cross-lane merge/branch edges can be drawn with fewer
// crossings. Bounded to ≤5 branches (≤24 permutations) to stay cheap and total; larger graphs keep the
// declared order. The commits stay in creation order and every branch still owns a lane, so the gitGraph
// style is preserved — `styleOk` + `lowestEnergy` pick the tidiest of the candidates.
const MAX_TIDY_BRANCHES = 5;
const permutations = <T>(items: readonly T[]): T[][] => {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const head = items[i];
    if (head === undefined) continue;
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([head, ...p]);
  }
  return out;
};

const COMMIT_H = 28;
const MIN_COMMIT_W = 30;
const PILL_PAD = 18; // horizontal label padding inside a commit pill
const GAP_MAIN = 28; // clear space between successive commits, on top of their extent
const GAP_LANE = 34; // clear space between branch lanes
const MARGIN = 16;
const HEAD_GAP = 28; // between a branch-name head and its lane's first commit
const HEAD_H = 26;
const HEAD_PAD = 16;
const MIN_HEAD_W = 48;

// A commit's display label: its id, with any release tag appended in brackets.
const commitLabel = (c: GitCommit): string => (c.tag === null ? c.id : `${c.id} [${c.tag}]`);

// `highlight` commits draw as a filled rectangle (Mermaid's highlight box); the rest are rounded pills.
const commitShape = (c: GitCommit): NodeShape => (c.commitType === "highlight" ? "rect" : "round");

// Deterministic git-graph layout — no ELK. Commits march along the main axis in creation order; each
// branch owns a lane on the cross axis. `LR` (Mermaid's default) runs commits left→right with lanes
// stacked top→bottom; `TB`/`BT` swap the axes (BT also flips the commit axis so history grows upward).
// Each commit is a pill sized to its id+tag (so the label sits inside, never overflowing a dot), and
// the pitch along each axis is sized to fit the pills, so neighbours never collide in any orientation.
// Edges connect each commit to its parent(s), so branch points fan out and merges fan back in.
export const layoutGitGraph = (
  ast: GitGraphAst,
  measure: MeasureText,
  tidy = false,
): Result<Scene, LayoutError> => {
  const pillW = (c: GitCommit): number =>
    Math.max(MIN_COMMIT_W, measure(commitLabel(c)) + PILL_PAD);
  // reduce, not Math.max(...spread): a spread over every commit/branch would exceed the argument-count
  // limit (and throw) on a very large history — keeping the core total.
  const maxPillW = ast.commits.reduce((m, c) => Math.max(m, pillW(c)), MIN_COMMIT_W);
  const headW = ast.branches.reduce((m, b) => Math.max(m, measure(b.name) + HEAD_PAD), MIN_HEAD_W);

  const vertical = ast.direction !== "LR";
  const lastCol = Math.max(0, ast.commits.length - 1);

  // Pitch along the axis where pills sit side by side must clear their width; along the other axis,
  // their height. Map those to the main (creation-order) and lane (branch) axes by orientation.
  const horizontalPitch = maxPillW + GAP_MAIN;
  const verticalPitch = COMMIT_H + GAP_LANE;
  const mainPitch = vertical ? verticalPitch : horizontalPitch;
  const lanePitch = vertical ? horizontalPitch : verticalPitch;

  const mainStart = (vertical ? HEAD_H : headW) + HEAD_GAP + MARGIN;
  const laneStart = MARGIN + (vertical ? maxPillW : COMMIT_H) / 2;
  const mainCoord = (col: number): number =>
    ast.direction === "BT" ? mainStart + (lastCol - col) * mainPitch : mainStart + col * mainPitch;
  const laneCoord = (l: number): number => laneStart + l * lanePitch;
  const place = (col: number, l: number): { x: number; y: number } =>
    vertical ? { x: laneCoord(l), y: mainCoord(col) } : { x: mainCoord(col), y: laneCoord(l) };

  // Build one scene for a given branch→lane assignment. The candidate selection below reuses it.
  const build = (laneOf: ReadonlyMap<GitBranchName, number>): Result<Scene, LayoutError> => {
    const nodes: SceneNode[] = [];
    const edges: SceneEdge[] = [];
    const center = new Map<GitCommitId, { readonly x: number; readonly y: number }>();
    let maxX = 0;
    let maxY = 0;
    const grow = (x: number, y: number): void => {
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };

    for (const b of ast.branches) {
      const c = place(0, laneOf.get(b.name) ?? b.order);
      const x = vertical ? c.x - headW / 2 : MARGIN;
      const y = vertical ? MARGIN : c.y - HEAD_H / 2;
      nodes.push({
        id: sceneNodeId(`branch:${b.name}`),
        bounds: rect(x, y, headW, HEAD_H),
        label: b.name,
        shape: "round",
        parent: null,
        icon: null,
        rows: null,
        rowDivider: null,
        subtitle: null,
        accent: "none",
        role: "normal",
      });
      grow(x + headW, y + HEAD_H);
    }

    for (const [col, commit] of ast.commits.entries()) {
      const l = laneOf.get(commit.branch);
      // Every commit's branch is registered in `ast.branches`; a miss means an inconsistent AST.
      if (l === undefined) {
        return err({
          kind: "layout",
          message: `gitGraph: commit ${commit.id} on undeclared branch ${commit.branch}`,
        });
      }
      const c = place(col, l);
      center.set(commit.id, c);
      const w = pillW(commit);
      nodes.push({
        id: sceneNodeId(commit.id),
        bounds: rect(c.x - w / 2, c.y - COMMIT_H / 2, w, COMMIT_H),
        label: commitLabel(commit),
        shape: commitShape(commit),
        parent: null,
        icon: null,
        rows: null,
        rowDivider: null,
        subtitle: null,
        accent: "none",
        role: "normal",
      });
      grow(c.x + w / 2, c.y + COMMIT_H / 2);
    }

    for (const commit of ast.commits) {
      const to = center.get(commit.id);
      if (to === undefined) continue;
      for (const parent of commit.parents) {
        const from = center.get(parent);
        // A parent always precedes its child in creation order, so its centre is known; skip defensively.
        if (from === undefined) continue;
        edges.push({
          id: sceneEdgeId(`${parent}->${commit.id}`),
          from: sceneNodeId(parent),
          to: sceneNodeId(commit.id),
          waypoints: [point(from.x, from.y), point(to.x, to.y)],
          label: null,
          stroke: "solid",
          fromEnd: "none",
          toEnd: "none",
          curved: true,
          fromLabel: null,
          toLabel: null,
          labelPos: null,
        });
      }
    }

    return ok({
      nodes,
      edges,
      wedges: [],
      decorations: [],
      extent: rect(0, 0, maxX + MARGIN, maxY + MARGIN),
    });
  };

  const declared = new Map<GitBranchName, number>(ast.branches.map((b) => [b.name, b.order]));
  const base = build(declared);
  // Tidy only kicks in for a handful of branches (bounded permutations); larger graphs keep the declared
  // order. The declared layout is always a candidate, so tidy can only equal or improve the energy.
  if (!tidy || ast.branches.length < 3 || ast.branches.length > MAX_TIDY_BRANCHES || !isOk(base)) {
    return base;
  }
  const [first, ...rest] = ast.branches;
  if (first === undefined) return base;
  const candidates: Scene[] = [base.value];
  for (const perm of permutations(rest)) {
    // Keep the first branch (conventionally `main`) on lane 0; permute the rest across the other lanes.
    const laneOf = new Map<GitBranchName, number>([[first.name, 0]]);
    perm.forEach((b, i) => {
      laneOf.set(b.name, i + 1);
    });
    const scene = build(laneOf);
    if (isOk(scene) && styleOk(scene.value)) candidates.push(scene.value);
  }
  return ok(lowestEnergy(candidates) ?? base.value);
};
