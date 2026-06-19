import { err, ok, point, rect, type Result } from "@m/std";
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
} from "@m/contracts";
import type { LayoutError, MeasureText } from "./graph.js";

const ACTOR_HEIGHT = 40;
const ACTOR_GAP = 60;
const LABEL_PADDING = 24;
const MIN_ACTOR_WIDTH = 60;
const HEADER_GAP = 40;
const MESSAGE_GAP = 40;
const BOTTOM_PADDING = 30;

const actorWidth = (label: string, measure: MeasureText): number =>
  Math.max(MIN_ACTOR_WIDTH, measure(label) + LABEL_PADDING);

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
  const bottomY = ACTOR_HEIGHT + HEADER_GAP + ast.messages.length * MESSAGE_GAP + BOTTOM_PADDING;
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
    });
    centerX.set(actor.id, cx);
    cursor += width + ACTOR_GAP;
  }

  const width = Math.max(0, cursor - ACTOR_GAP);

  for (const [index, message] of ast.messages.entries()) {
    const y = ACTOR_HEIGHT + HEADER_GAP + (index + 1) * MESSAGE_GAP;
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
    });
  }

  return ok({ nodes, edges, wedges: [], extent: rect(0, 0, width, bottomY) });
};
