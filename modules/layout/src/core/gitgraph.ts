import { brand, err, ok, point, rect, type Result } from "@m/std";
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
import type { LayoutError, MeasureText } from "./graph.js";

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
): Result<Scene, LayoutError> => {
  const lane = new Map<GitBranchName, number>();
  for (const b of ast.branches) lane.set(b.name, b.order);

  const pillW = (c: GitCommit): number =>
    Math.max(MIN_COMMIT_W, measure(commitLabel(c)) + PILL_PAD);
  const maxPillW = Math.max(MIN_COMMIT_W, ...ast.commits.map(pillW));
  const headW = Math.max(MIN_HEAD_W, ...ast.branches.map((b) => measure(b.name) + HEAD_PAD));

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
    const c = place(0, b.order);
    const x = vertical ? c.x - headW / 2 : MARGIN;
    const y = vertical ? MARGIN : c.y - HEAD_H / 2;
    nodes.push({
      id: brand<string, "SceneNodeId">(`branch:${b.name}`),
      bounds: rect(x, y, headW, HEAD_H),
      label: b.name,
      shape: "round",
      parent: null,
      icon: null,
      rows: null,
      rowDivider: null,
      subtitle: null,
    });
    grow(x + headW, y + HEAD_H);
  }

  for (const [col, commit] of ast.commits.entries()) {
    const l = lane.get(commit.branch);
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
      id: brand<string, "SceneNodeId">(commit.id),
      bounds: rect(c.x - w / 2, c.y - COMMIT_H / 2, w, COMMIT_H),
      label: commitLabel(commit),
      shape: commitShape(commit),
      parent: null,
      icon: null,
      rows: null,
      rowDivider: null,
      subtitle: null,
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
        id: brand<string, "SceneEdgeId">(`${parent}->${commit.id}`),
        from: brand<string, "SceneNodeId">(parent),
        to: brand<string, "SceneNodeId">(commit.id),
        waypoints: [point(from.x, from.y), point(to.x, to.y)],
        label: null,
        stroke: "solid",
        fromEnd: "none",
        toEnd: "none",
      });
    }
  }

  return ok({
    nodes,
    edges,
    wedges: [],
    extent: rect(0, 0, maxX + MARGIN, maxY + MARGIN),
  });
};
