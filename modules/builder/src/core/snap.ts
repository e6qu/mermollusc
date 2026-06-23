import type { SceneNode, SceneNodeId } from "@m/contracts";

// Alignment-snap tolerance in scene px: the largest gap a dragged edge can have to a candidate guide
// line and still snap to it.
export const SNAP_T = 6;

// The smallest shift (within `SNAP_T`) that lands one of the dragged box's `edges` on a candidate
// line, and the line it snapped to (null = no snap). Picks the closest candidate across all edges.
export const snapAxis = (
  edges: readonly number[],
  targets: readonly number[],
): { readonly delta: number; readonly line: number | null } => {
  let delta = 0;
  let line: number | null = null;
  let dist = SNAP_T + 1;
  for (const e of edges) {
    for (const t of targets) {
      const d = Math.abs(t - e);
      if (d <= SNAP_T && d < dist) {
        dist = d;
        delta = t - e;
        line = t;
      }
    }
  }
  return { delta, line };
};

// Every *other* node's left/centre/right xs and top/middle/bottom ys — the lines a drag or resize snaps to.
export const snapCandidates = (
  nodes: readonly SceneNode[],
  exceptId: SceneNodeId,
): { readonly xs: number[]; readonly ys: number[] } => {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const nd of nodes) {
    if (nd.id === exceptId) continue;
    const { origin: o, size: s } = nd.bounds;
    xs.push(o.x, o.x + s.width / 2, o.x + s.width);
    ys.push(o.y, o.y + s.height / 2, o.y + s.height);
  }
  return { xs, ys };
};
