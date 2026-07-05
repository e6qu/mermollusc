import { point, type Point } from "@m/std";
import type { Scene, SceneNodeId } from "@m/contracts";

// Force-directed ("spring") relaxation of a laid-out scene, for the "Relax" affordance across every
// graph-like family. It is PURE and DETERMINISTIC: it seeds from the current node centres (never random),
// so the same diagram always relaxes to the same result and the core stays testable. Fruchterman-Reingold
// forces — every unit repels every other, each edge pulls its endpoints together — cooled over a fixed
// schedule.
//
// It operates on TOP-LEVEL UNITS (a node with no parent): a leaf moves as a point, a container moves
// rigidly carrying its descendants, so nesting (subgraphs / groups / boundaries) is preserved. PINNED
// units are held fixed and the forces flow around them. Returns the new ORIGIN for every node that moved
// (a moved container plus each of its descendants, translated by the same delta); unmoved / pinned nodes
// are absent, so the caller applies exactly the deltas that changed.

const ITERATIONS = 320;
// Ideal edge length — matches the `elk.stress.desiredEdgeLength` the flowchart organic relax uses.
const DESIRED = 140;
// Extra breathing room kept between two boxes on top of the spring length, so relaxed nodes don't touch.
const PADDING = 24;
// Gravity toward the layout centroid, applied per unit each step. Plain Fruchterman-Reingold has NO force
// holding a disconnected node (no incident edge) in place, so pure repulsion flings it to infinity and the
// canvas balloons. A gentle centre pull bounds the whole layout and keeps disconnected pieces compact.
const GRAVITY = 0.06;
// Repulsion is only computed between units within this centre distance. Beyond it two units barely affect
// each other anyway, and the cutoff stops far-apart / disconnected clusters from shoving each other ever
// further out (the other half of the blow-up). Distant separation is handled by gravity + the spring net.
const REPULSION_CUTOFF = 5 * DESIRED;

interface Unit {
  readonly id: SceneNodeId;
  x: number;
  y: number;
  readonly halfW: number;
  readonly halfH: number;
  readonly pinned: boolean;
  // Accumulated force for the current iteration.
  fx: number;
  fy: number;
}

// The nearest ancestor with no parent — the top-level unit a node belongs to (itself, if top-level).
const topAncestor = (
  id: SceneNodeId,
  parentOf: ReadonlyMap<SceneNodeId, SceneNodeId | null>,
): SceneNodeId => {
  let cur: SceneNodeId = id;
  // The parent chain is finite and acyclic (layout output), so this terminates.
  for (;;) {
    const p = parentOf.get(cur) ?? null;
    if (p === null) return cur;
    cur = p;
  }
};

export const relaxScene = (
  scene: Scene,
  pinned: ReadonlySet<SceneNodeId>,
): ReadonlyMap<SceneNodeId, Point> => {
  const parentOf = new Map<SceneNodeId, SceneNodeId | null>(
    scene.nodes.map((n) => [n.id, n.parent]),
  );
  // One Unit per top-level node; a container's half-extent is its own box (it moves rigidly).
  const units = new Map<SceneNodeId, Unit>();
  for (const n of scene.nodes) {
    if (n.parent !== null) continue;
    units.set(n.id, {
      id: n.id,
      x: n.bounds.origin.x + n.bounds.size.width / 2,
      y: n.bounds.origin.y + n.bounds.size.height / 2,
      halfW: n.bounds.size.width / 2,
      halfH: n.bounds.size.height / 2,
      pinned: pinned.has(n.id),
      fx: 0,
      fy: 0,
    });
  }
  if (units.size < 2) return new Map();

  // Edges pull the top-level units their endpoints belong to; an edge inside one container (both ends map
  // to the same unit) exerts no force.
  const springs: (readonly [Unit, Unit])[] = [];
  for (const e of scene.edges) {
    const a = units.get(topAncestor(e.from, parentOf));
    const b = units.get(topAncestor(e.to, parentOf));
    if (a !== undefined && b !== undefined && a !== b) springs.push([a, b]);
  }

  const list = [...units.values()];
  const k = DESIRED;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (const u of list) {
      u.fx = 0;
      u.fy = 0;
    }
    // Centroid of the current layout — the target every unit is gently pulled toward (gravity, below).
    let cx = 0;
    let cy = 0;
    for (const u of list) {
      cx += u.x;
      cy += u.y;
    }
    cx /= list.length;
    cy /= list.length;
    // Repulsion between every pair. Size-aware: the distance is measured between box edges (centre gap
    // minus each half-extent along the axis) so large boxes keep proportionally further apart.
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a === undefined) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b === undefined) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        // Far-apart units barely repel — skip them so disconnected clusters aren't shoved ever further out.
        if (dist > REPULSION_CUTOFF) continue;
        if (dist < 0.01) {
          // Coincident boxes: nudge apart deterministically by index so the sim doesn't divide by zero.
          dx = (i - j) * 0.5 || 0.5;
          dy = 0.5;
          dist = Math.hypot(dx, dy);
        }
        const gap = Math.max(1, dist - (a.halfW + a.halfH + b.halfW + b.halfH) / 2 - PADDING);
        const force = (k * k) / gap;
        const ux = dx / dist;
        const uy = dy / dist;
        a.fx += ux * force;
        a.fy += uy * force;
        b.fx -= ux * force;
        b.fy -= uy * force;
      }
    }
    // Attraction along edges.
    for (const [a, b] of springs) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.max(0.01, Math.hypot(dx, dy));
      const force = (dist * dist) / k;
      const ux = dx / dist;
      const uy = dy / dist;
      a.fx -= ux * force;
      a.fy -= uy * force;
      b.fx += ux * force;
      b.fy += uy * force;
    }
    // Gravity: pull every unit toward the centroid, proportional to its distance from it. This is the only
    // force acting on a disconnected node, so it sets the layout's overall radius and stops it ballooning.
    for (const u of list) {
      u.fx += (cx - u.x) * GRAVITY;
      u.fy += (cy - u.y) * GRAVITY;
    }
    // Cool linearly from k to ~0: the per-step move is capped by the temperature, so early iterations
    // make big rearrangements and late ones settle.
    const temp = k * (1 - iter / ITERATIONS);
    for (const u of list) {
      if (u.pinned) continue;
      const mag = Math.hypot(u.fx, u.fy);
      if (mag < 0.01) continue;
      const step = Math.min(mag, temp);
      u.x += (u.fx / mag) * step;
      u.y += (u.fy / mag) * step;
    }
  }

  // Box-overlap resolution. Fruchterman-Reingold repels by CENTRE distance, which does NOT guarantee two
  // boxes don't overlap — a big group/subgraph container can settle on top of a neighbour. Do a few
  // settling passes that push any overlapping pair apart along their axis of least penetration (the
  // minimum-translation vector), splitting the push unless one side is pinned. This is what keeps group
  // containers from overlapping after a relax.
  const separate = (a: Unit, b: Unit, dx: number, dy: number): void => {
    if (a.pinned && b.pinned) return;
    if (a.pinned) {
      b.x -= dx;
      b.y -= dy;
    } else if (b.pinned) {
      a.x += dx;
      a.y += dy;
    } else {
      a.x += dx / 2;
      a.y += dy / 2;
      b.x -= dx / 2;
      b.y -= dy / 2;
    }
  };
  for (let pass = 0; pass < 100; pass++) {
    let overlapped = false;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a === undefined) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b === undefined) continue;
        const ox = a.halfW + b.halfW + PADDING - Math.abs(a.x - b.x);
        const oy = a.halfH + b.halfH + PADDING - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue; // boxes (plus padding) don't overlap
        overlapped = true;
        if (ox < oy) separate(a, b, a.x >= b.x ? ox : -ox, 0);
        else separate(a, b, 0, a.y >= b.y ? oy : -oy);
      }
    }
    if (!overlapped) break;
  }

  // Translate each moved unit — and, for a container, its descendants — by the unit's centre delta.
  const moved = new Map<SceneNodeId, Point>();
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  for (const n of scene.nodes) {
    const unit = units.get(topAncestor(n.id, parentOf));
    if (unit === undefined || unit.pinned) continue;
    const top = byId.get(unit.id);
    if (top === undefined) continue;
    const dx = unit.x - (top.bounds.origin.x + top.bounds.size.width / 2);
    const dy = unit.y - (top.bounds.origin.y + top.bounds.size.height / 2);
    if (dx === 0 && dy === 0) continue;
    moved.set(n.id, point(n.bounds.origin.x + dx, n.bounds.origin.y + dy));
  }
  return moved;
};
