import { err, ok, point, rect, type Point, type Result } from "@m/std";
import { sceneNodeId, sceneEdgeId } from "@m/contracts";
import type {
  ActorId,
  EdgeEnd,
  EdgeStroke,
  MessageKind,
  Scene,
  SceneEdge,
  SceneNode,
  SequenceAst,
  SequenceNote,
} from "@m/contracts";
import type { LayoutError, MeasureText } from "./graph.js";
import { clampedWidth } from "./measure.js";

const ACTOR_HEIGHT = 40;
const ACTOR_GAP = 60;
const LABEL_PADDING = 24;
const MIN_ACTOR_WIDTH = 60;
const HEADER_GAP = 40;
const MESSAGE_GAP = 40;
const BOTTOM_PADDING = 30;
const NOTE_HEIGHT = 30;
const NOTE_PADDING = 20; // horizontal text padding inside a note box
const NOTE_GAP = 16; // distance from a lifeline to a `left of` / `right of` note box

const actorWidth = (label: string, measure: MeasureText): number =>
  clampedWidth(label, measure, MIN_ACTOR_WIDTH, LABEL_PADDING);

const MESSAGE_STYLE: Record<MessageKind, { readonly stroke: EdgeStroke; readonly toEnd: EdgeEnd }> =
  {
    solid: { stroke: "solid", toEnd: "arrow" },
    dashed: { stroke: "dashed", toEnd: "arrow" },
    solidOpen: { stroke: "solid", toEnd: "none" },
    dashedOpen: { stroke: "dashed", toEnd: "none" },
  };

// Deterministic lane layout — no ELK. Actors sit in a row; each has a vertical lifeline; messages
// are horizontal arrows stacked top-to-bottom in source order. Lifelines reuse SceneEdge (a
// self-edge from the actor to itself) so the renderer needs no new concept.
export const layoutSequence = (
  ast: SequenceAst,
  measure: MeasureText,
): Result<Scene, LayoutError> => {
  // Notes share the vertical stack with messages: each occupies one row at its source position. The
  // combined row count drives the diagram height and every message/note row index.
  const totalRows = ast.messages.length + ast.notes.length;
  const rowY = (row: number): number => ACTOR_HEIGHT + HEADER_GAP + (row + 1) * MESSAGE_GAP;
  const bottomY = ACTOR_HEIGHT + HEADER_GAP + totalRows * MESSAGE_GAP + BOTTOM_PADDING;
  const centerX = new Map<ActorId, number>();
  const nodes: SceneNode[] = [];
  const edges: SceneEdge[] = [];
  let cursor = 0;
  // One pass over the actors places each box and drops its lifeline using the known centre — no
  // second lookup, so no fallback for a "missing" centre that can't happen.
  for (const actor of ast.actors) {
    const width = actorWidth(actor.label, measure);
    const cx = cursor + width / 2;
    nodes.push({
      id: sceneNodeId(actor.id),
      bounds: rect(cursor, 0, width, ACTOR_HEIGHT),
      label: actor.label,
      shape: "rect",
      parent: null,
      icon: null,
      rows: null,
      rowDivider: null,
      subtitle: null,
      accent: "none",
      role: "normal",
    });
    edges.push({
      id: sceneEdgeId(`lifeline:${actor.id}`),
      from: sceneNodeId(actor.id),
      to: sceneNodeId(actor.id),
      waypoints: [point(cx, ACTOR_HEIGHT), point(cx, bottomY)],
      label: null,
      stroke: "dashed",
      fromEnd: "none",
      toEnd: "none",
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos: null,
      accent: "none",
    });
    centerX.set(actor.id, cx);
    cursor += width + ACTOR_GAP;
  }

  const actorsRight = Math.max(0, cursor - ACTOR_GAP);
  // A `left of` note on the leftmost actor can land at a negative x; track the bounds and shift the
  // whole scene right at the end so the layout keeps the (0,0)-origin extent every other family uses.
  let minX = 0;
  let maxX = actorsRight;

  const emitNote = (note: SequenceNote, r: number): LayoutError | null => {
    const centers: number[] = [];
    for (const t of note.targets) {
      const c = centerX.get(t);
      if (c === undefined) {
        return {
          kind: "layout",
          message: `sequence: note ${note.id} references an undeclared actor`,
        };
      }
      centers.push(c);
    }
    const first = centers[0];
    if (first === undefined) {
      return { kind: "layout", message: `sequence: note ${note.id} has no target` };
    }
    const left = centers.reduce((a, b) => Math.min(a, b), first);
    const right = centers.reduce((a, b) => Math.max(a, b), first);
    const textW = clampedWidth(note.text, measure, MIN_ACTOR_WIDTH, NOTE_PADDING);
    const w = note.side === "over" ? Math.max(textW, right - left + NOTE_PADDING * 2) : textW;
    const x =
      note.side === "over"
        ? (left + right) / 2 - w / 2
        : note.side === "left"
          ? left - NOTE_GAP - w
          : right + NOTE_GAP;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + w);
    nodes.push({
      id: sceneNodeId(note.id),
      bounds: rect(x, rowY(r) - NOTE_HEIGHT / 2, w, NOTE_HEIGHT),
      label: note.text,
      shape: "rect",
      parent: null,
      icon: null,
      rows: null,
      rowDivider: null,
      subtitle: null,
      accent: "none",
      role: "stateNote",
    });
    return null;
  };

  // Interleave messages and notes by source order. `after` is non-decreasing, so one sweep over the
  // message indices emits each note anchored after a given message (and trailing notes at the end).
  let ni = 0;
  let row = 0;
  for (let mi = 0; mi <= ast.messages.length; mi++) {
    while (ni < ast.notes.length) {
      const note = ast.notes[ni];
      if (note === undefined || note.after !== mi) break;
      const noteErr = emitNote(note, row);
      if (noteErr !== null) return err(noteErr);
      row++;
      ni++;
    }
    if (mi >= ast.messages.length) break;
    const message = ast.messages[mi];
    if (message === undefined) continue;
    const y = rowY(row);
    // Parser output always declares an actor for every message endpoint; a miss means the AST is
    // internally inconsistent, so fail loudly rather than place the arrow at a phantom x=0.
    const fromX = centerX.get(message.from);
    const toX = centerX.get(message.to);
    if (fromX === undefined || toX === undefined) {
      return err({
        kind: "layout",
        message: `sequence: message ${message.id} references an undeclared actor`,
      });
    }
    const style = MESSAGE_STYLE[message.kind];
    edges.push({
      id: sceneEdgeId(message.id),
      from: sceneNodeId(message.from),
      to: sceneNodeId(message.to),
      waypoints: [point(fromX, y), point(toX, y)],
      label: message.text === "" ? null : message.text,
      stroke: style.stroke,
      fromEnd: "none",
      toEnd: style.toEnd,
      curved: false,
      fromLabel: null,
      toLabel: null,
      labelPos: null,
      accent: "none",
    });
    row++;
  }
  // Defensive: a hand-built AST whose note `after` exceeds the message count still gets placed (the
  // parser caps it, so this is just totality insurance).
  while (ni < ast.notes.length) {
    const note = ast.notes[ni];
    if (note !== undefined) {
      const noteErr = emitNote(note, row);
      if (noteErr !== null) return err(noteErr);
      row++;
    }
    ni++;
  }

  const dx = minX < 0 ? -minX : 0;
  const extent = rect(0, 0, maxX + dx, bottomY);
  if (dx === 0) {
    return ok({ nodes, edges, wedges: [], decorations: [], extent });
  }
  const shift = (p: Point): Point => point(p.x + dx, p.y);
  return ok({
    nodes: nodes.map((n) => ({
      ...n,
      bounds: rect(
        n.bounds.origin.x + dx,
        n.bounds.origin.y,
        n.bounds.size.width,
        n.bounds.size.height,
      ),
    })),
    edges: edges.map((e) => {
      // Keep the non-empty-tuple shape of `waypoints` by destructuring its two required head points.
      const [a, b, ...rest] = e.waypoints;
      return { ...e, waypoints: [shift(a), shift(b), ...rest.map(shift)] };
    }),
    wedges: [],
    decorations: [],
    extent,
  });
};

// Family-context style invariant: a sequence diagram's actor heads all sit on one top row, and every
// lifeline drops straight down (a vertical line under its actor). Lives here because only the family
// knows which nodes are actors (by id) and which edges are lifelines (`lifeline:` prefix). Vacuously
// true when there are no actors.
export const sequenceActorsShareHeaderRow = (scene: Scene, ast: SequenceAst): boolean => {
  const actorIds = new Set(ast.actors.map((a) => sceneNodeId(a.id)));
  const tops = scene.nodes.filter((n) => actorIds.has(n.id)).map((n) => n.bounds.origin.y);
  const first = tops[0];
  if (first === undefined) return true;
  if (!tops.every((y) => Math.abs(y - first) < 1e-6)) return false;
  for (const e of scene.edges) {
    if (!e.id.startsWith("lifeline:")) continue;
    const x0 = e.waypoints[0]?.x;
    if (x0 !== undefined && !e.waypoints.every((p) => Math.abs(p.x - x0) < 1e-6)) return false;
  }
  return true;
};
