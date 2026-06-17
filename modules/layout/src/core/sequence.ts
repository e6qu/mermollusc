import { brand, point, rect } from "@m/std";
import type {
  ActorId,
  EdgeArrow,
  EdgeStroke,
  MessageKind,
  Scene,
  SceneEdge,
  SceneNode,
  SequenceAst,
} from "@m/contracts";
import type { MeasureText } from "./graph.js";

const ACTOR_HEIGHT = 40;
const ACTOR_GAP = 60;
const LABEL_PADDING = 24;
const MIN_ACTOR_WIDTH = 60;
const HEADER_GAP = 40;
const MESSAGE_GAP = 40;
const BOTTOM_PADDING = 30;

const actorWidth = (label: string, measure: MeasureText): number =>
  Math.max(MIN_ACTOR_WIDTH, measure(label) + LABEL_PADDING);

const MESSAGE_STYLE: Record<
  MessageKind,
  { readonly stroke: EdgeStroke; readonly arrow: EdgeArrow }
> = {
  solid: { stroke: "solid", arrow: "filled" },
  dashed: { stroke: "dashed", arrow: "filled" },
  solidOpen: { stroke: "solid", arrow: "none" },
  dashedOpen: { stroke: "dashed", arrow: "none" },
};

// Deterministic lane layout — no ELK. Actors sit in a row; each has a vertical lifeline; messages
// are horizontal arrows stacked top-to-bottom in source order. Lifelines reuse SceneEdge (a
// self-edge from the actor to itself) so the renderer needs no new concept.
export const layoutSequence = (ast: SequenceAst, measure: MeasureText): Scene => {
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
      id: brand<string, "SceneNodeId">(actor.id),
      bounds: rect(cursor, 0, width, ACTOR_HEIGHT),
      label: actor.label,
      shape: "rect",
      parent: null,
      icon: null,
    });
    edges.push({
      id: brand<string, "SceneEdgeId">(`lifeline:${actor.id}`),
      from: brand<string, "SceneNodeId">(actor.id),
      to: brand<string, "SceneNodeId">(actor.id),
      waypoints: [point(cx, ACTOR_HEIGHT), point(cx, bottomY)],
      label: null,
      stroke: "dashed",
      arrow: "none",
    });
    centerX.set(actor.id, cx);
    cursor += width + ACTOR_GAP;
  }

  const width = Math.max(0, cursor - ACTOR_GAP);

  for (const [index, message] of ast.messages.entries()) {
    const y = ACTOR_HEIGHT + HEADER_GAP + (index + 1) * MESSAGE_GAP;
    // A message endpoint is always an actor for parser output; the `?? 0` only guards a hand-built
    // inconsistent AST (a pure layout can't fail loudly — it returns a Scene, not a Result).
    const fromX = centerX.get(message.from) ?? 0;
    const toX = centerX.get(message.to) ?? 0;
    const style = MESSAGE_STYLE[message.kind];
    edges.push({
      id: brand<string, "SceneEdgeId">(message.id),
      from: brand<string, "SceneNodeId">(message.from),
      to: brand<string, "SceneNodeId">(message.to),
      waypoints: [point(fromX, y), point(toX, y)],
      label: message.text === "" ? null : message.text,
      stroke: style.stroke,
      arrow: style.arrow,
    });
  }

  return { nodes, edges, extent: rect(0, 0, width, bottomY) };
};
