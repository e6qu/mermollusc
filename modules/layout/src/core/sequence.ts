import { brand, point, rect } from "@m/std";
import type {
  EdgeArrow,
  EdgeStroke,
  MessageKind,
  Scene,
  SceneEdge,
  SceneNode,
  SequenceAst,
} from "@m/contracts";

const ACTOR_HEIGHT = 40;
const ACTOR_GAP = 60;
const CHAR_WIDTH = 8;
const LABEL_PADDING = 24;
const MIN_ACTOR_WIDTH = 60;
const HEADER_GAP = 40;
const MESSAGE_GAP = 40;
const BOTTOM_PADDING = 30;

const actorWidth = (label: string): number =>
  Math.max(MIN_ACTOR_WIDTH, label.length * CHAR_WIDTH + LABEL_PADDING);

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
export const layoutSequence = (ast: SequenceAst): Scene => {
  const centerX = new Map<string, number>();
  const nodes: SceneNode[] = [];
  let cursor = 0;
  for (const actor of ast.actors) {
    const width = actorWidth(actor.label);
    nodes.push({
      id: brand<string, "SceneNodeId">(actor.id),
      bounds: rect(cursor, 0, width, ACTOR_HEIGHT),
      label: actor.label,
      shape: "rect",
      parent: null,
      icon: null,
    });
    centerX.set(actor.id, cursor + width / 2);
    cursor += width + ACTOR_GAP;
  }

  const width = Math.max(0, cursor - ACTOR_GAP);
  const bottomY = ACTOR_HEIGHT + HEADER_GAP + ast.messages.length * MESSAGE_GAP + BOTTOM_PADDING;

  const edges: SceneEdge[] = [];
  for (const actor of ast.actors) {
    const x = centerX.get(actor.id) ?? 0;
    edges.push({
      id: brand<string, "SceneEdgeId">(`lifeline:${actor.id}`),
      from: brand<string, "SceneNodeId">(actor.id),
      to: brand<string, "SceneNodeId">(actor.id),
      waypoints: [point(x, ACTOR_HEIGHT), point(x, bottomY)],
      label: null,
      stroke: "dashed",
      arrow: "none",
    });
  }

  for (const [index, message] of ast.messages.entries()) {
    const y = ACTOR_HEIGHT + HEADER_GAP + (index + 1) * MESSAGE_GAP;
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
