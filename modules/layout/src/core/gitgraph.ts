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

// Order branch lanes by the barycenter (mean adjacent lane) of the branches each connects to via a
// cross-branch commit edge — the classic crossing-reduction heuristic, for git graphs with too many
// branches to brute-force the optimum (above MAX_TIDY_BRANCHES). Deterministic (stable name tie-break),
// pins the first branch (conventionally `main`) to lane 0, and iterates to a fixpoint.
const barycenterLanes = (ast: GitGraphAst): Map<GitBranchName, number> => {
  const branchOf = new Map<GitCommitId, GitBranchName>(ast.commits.map((c) => [c.id, c.branch]));
  const adj = new Map<GitBranchName, Map<GitBranchName, number>>();
  const link = (a: GitBranchName, b: GitBranchName): void => {
    if (a === b) return;
    const m = adj.get(a) ?? new Map<GitBranchName, number>();
    m.set(b, (m.get(b) ?? 0) + 1);
    adj.set(a, m);
  };
  for (const c of ast.commits) {
    for (const p of c.parents) {
      const pb = branchOf.get(p);
      if (pb !== undefined) {
        link(c.branch, pb);
        link(pb, c.branch);
      }
    }
  }
  const first = ast.branches[0]?.name ?? null;
  let lane = new Map<GitBranchName, number>(ast.branches.map((b) => [b.name, b.order]));
  for (let iter = 0; iter < 8; iter++) {
    const keyed = ast.branches.map((b) => {
      const m = adj.get(b.name);
      let sum = 0;
      let weight = 0;
      if (m !== undefined) {
        for (const [other, w] of m) {
          sum += (lane.get(other) ?? 0) * w;
          weight += w;
        }
      }
      return { name: b.name, key: weight === 0 ? (lane.get(b.name) ?? 0) : sum / weight };
    });
    keyed.sort((a, b) => a.key - b.key || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const rest = keyed.map((k) => k.name).filter((n) => n !== first);
    const order = first === null ? rest : [first, ...rest];
    const next = new Map<GitBranchName, number>(order.map((n, i) => [n, i]));
    let same = true;
    for (const [n, l] of next) {
      if (lane.get(n) !== l) {
        same = false;
        break;
      }
    }
    lane = next;
    if (same) break;
  }
  return lane;
};

const COMMIT_H = 28;
const MIN_COMMIT_W = 30;
const PILL_PAD = 18; // horizontal label padding inside a commit pill
const GAP_MAIN = 28; // clear space between successive commits, on top of their extent
const GAP_LANE = 34; // clear space between branch lanes
const MARGIN = 16;
const HEAD_GAP = 28; // between a branch-name head and its lane's first commit
const HEAD_H = 50; // tall enough for the per-branch stickman plus its name on the bottom row
const HEAD_PAD = 16;
const MIN_HEAD_W = 48;

// A short, git-like abbreviated SHA derived deterministically from the commit id (FNV-1a → 7 hex), so
// every commit reads like a real one (`a3f9c21`) regardless of how it was authored. Same id → same sha.
const shortSha = (id: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 7);
};

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
  classic = false,
): Result<Scene, LayoutError> => {
  const commitLabel = (c: GitCommit): string =>
    classic ? "" : c.tag === null ? shortSha(c.id) : `${shortSha(c.id)} [${c.tag}]`;
  const commitShape = (c: GitCommit): NodeShape =>
    classic
      ? c.commitType === "highlight"
        ? "rect"
        : "circle"
      : c.commitType === "highlight"
        ? "rect"
        : "round";
  const pillW = (c: GitCommit): number =>
    classic ? COMMIT_H : Math.max(MIN_COMMIT_W, measure(commitLabel(c)) + PILL_PAD);
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

  // Leave HEAD_GAP of clear space between the branch head and the NEAR EDGE of the first commit — so add
  // the commit's main-axis half-extent (its width along the commit axis), or the first wide sha pill
  // would overlap the head box.
  const mainStart =
    (vertical ? HEAD_H : headW) + HEAD_GAP + MARGIN + (vertical ? COMMIT_H : maxPillW) / 2;
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
    const widthById = new Map<GitCommitId, number>();
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
        // Classic (Mermaid parity) tags each lane with a plain label pill, like real Mermaid's branch
        // tags; the opt-in Pills style keeps the house stickman — the person working that line.
        shape: classic ? "rect" : "actor",
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
      widthById.set(commit.id, w);
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

    // Trim an endpoint from a pill's centre to where the parent→child line crosses its border, so the
    // arrowhead lands ON the pill edge (visible) instead of hidden under the pill.
    const borderPoint = (cx: number, cy: number, w: number, toward: { x: number; y: number }) => {
      const dx = toward.x - cx;
      const dy = toward.y - cy;
      if (dx === 0 && dy === 0) return point(cx, cy);
      const tx = dx === 0 ? Number.POSITIVE_INFINITY : w / 2 / Math.abs(dx);
      const ty = dy === 0 ? Number.POSITIVE_INFINITY : COMMIT_H / 2 / Math.abs(dy);
      const t = Math.min(tx, ty);
      return point(cx + dx * t, cy + dy * t);
    };
    for (const commit of ast.commits) {
      const to = center.get(commit.id);
      const toW = widthById.get(commit.id);
      if (to === undefined || toW === undefined) continue;
      for (const parent of commit.parents) {
        const from = center.get(parent);
        const fromW = widthById.get(parent);
        // A parent always precedes its child in creation order, so its centre is known; skip defensively.
        if (from === undefined || fromW === undefined) continue;
        const start = borderPoint(from.x, from.y, fromW, to);
        const end = borderPoint(to.x, to.y, toW, from);
        edges.push({
          id: sceneEdgeId(`${parent}->${commit.id}`),
          from: sceneNodeId(parent),
          to: sceneNodeId(commit.id),
          // Straight, border-to-border, with an arrowhead — so the parent → child direction is explicit.
          waypoints: [start, end],
          label: null,
          stroke: "solid",
          fromEnd: "none",
          toEnd: "arrow", // history flows parent → child; the arrowhead points to the newer commit
          curved: false,
          fromLabel: null,
          toLabel: null,
          labelPos: null,
          accent: "none",
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
  if (!tidy || ast.branches.length < 3 || !isOk(base)) return base;
  // Many branches: brute-forcing every lane permutation is infeasible, so order lanes by barycenter and
  // keep whichever of {declared, barycenter} has the lower energy. The declared layout is always a
  // candidate, so tidy can only equal or improve it.
  if (ast.branches.length > MAX_TIDY_BRANCHES) {
    const bary = build(barycenterLanes(ast));
    if (isOk(bary) && styleOk(bary.value))
      return ok(lowestEnergy([base.value, bary.value]) ?? base.value);
    return base;
  }
  // Few branches: brute-force the optimum (the declared order is always one candidate).
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
