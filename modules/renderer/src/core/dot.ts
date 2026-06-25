import type { EdgeEnd, FlowDirection, NodeShape, Scene, SceneNode } from "@m/contracts";

// Serialises a Scene to Graphviz DOT. The Scene is the universal graph IR, so this exports *any*
// node/edge family (flowchart, state, ER, class, …) to DOT. A pie chart's slices are invisible
// `marker` nodes (its visual lives in `wedges`), so they're skipped and a pie exports as an empty
// graph. The reverse of `parseDot`. Geometry (waypoints, positions) is dropped — DOT is abstract —
// but labels, shapes, dashed strokes, and arrow ends are preserved.

// `"`, `\`, and newlines must be escaped inside a DOT quoted id/label.
const esc = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

const SHAPE: Record<NodeShape, string> = {
  rect: "box",
  round: "box",
  stadium: "box",
  circle: "circle",
  diamond: "diamond",
  container: "box",
};

// `round`/`stadium` map onto a rounded box (DOT has no stadium); the rest map to a native DOT shape.
const ROUNDED = new Set<NodeShape>(["round", "stadium"]);

// One Scene edge end → the nearest Graphviz arrowtype. `arrow` is DOT's default `normal`, so it needs
// no attribute (null). The `o`-prefixed types are the hollow/open variants (Graphviz arrow modifiers).
const ARROWTYPE: Record<EdgeEnd, string | null> = {
  none: "none",
  arrow: null,
  arrowOpen: "vee",
  triangle: "onormal",
  diamondFilled: "diamond",
  diamondHollow: "odiamond",
  one: "tee",
  zeroOrOne: "otee",
  oneOrMany: "crow",
  zeroOrMany: "ocrow",
};

// `rankdir` carries the source diagram's flow direction (`TB`/`BT`/`LR`/`RL` are valid Graphviz
// rankdir values); pass null for a family with no inherent direction (pie, sequence, …).
export const toDot = (scene: Scene, rankdir: FlowDirection | null): string => {
  const lines: string[] = ["digraph {"];
  if (rankdir !== null) lines.push(`  rankdir=${rankdir};`);

  // Subgraph hierarchy (flowchart subgraphs, imported DOT clusters) lives in the Scene as `container`
  // nodes whose members carry `parent`. Re-emit a container as a `cluster_*` subgraph (so Graphviz —
  // and our own re-import — box it) with its members nested inside.
  const childrenOf = new Map<string, SceneNode[]>();
  for (const node of scene.nodes) {
    if (node.parent === null) continue;
    const siblings = childrenOf.get(node.parent);
    if (siblings === undefined) childrenOf.set(node.parent, [node]);
    else siblings.push(node);
  }
  const emitNode = (node: SceneNode, indent: string): void => {
    // Invisible markers (pie slices, …) carry no graph meaning — skip so a pie exports as an empty
    // graph instead of orphan boxes, mirroring how the renderer draws nothing for them.
    if (node.role === "marker") return;
    if (node.shape === "container") {
      // Don't double-prefix an id that's already `cluster_…` (a re-exported DOT import) — the parser
      // keeps the `cluster_` prefix on import, so re-prepending would grow it on every round-trip.
      const clusterId = node.id.toLowerCase().startsWith("cluster")
        ? node.id
        : `cluster_${node.id}`;
      lines.push(`${indent}subgraph "${esc(clusterId)}" {`);
      lines.push(`${indent}  label="${esc(node.label)}";`);
      for (const child of childrenOf.get(node.id) ?? []) emitNode(child, `${indent}  `);
      lines.push(`${indent}}`);
      return;
    }
    const attrs = [`label="${esc(node.label)}"`, `shape=${SHAPE[node.shape]}`];
    if (ROUNDED.has(node.shape)) attrs.push('style="rounded"');
    lines.push(`${indent}"${esc(node.id)}" [${attrs.join(", ")}];`);
  };
  for (const node of scene.nodes) {
    if (node.parent === null) emitNode(node, "  ");
  }

  for (const edge of scene.edges) {
    const attrs: string[] = [];
    if (edge.label !== null) attrs.push(`label="${esc(edge.label)}"`);
    if (edge.stroke === "dashed") attrs.push('style="dashed"');
    // A `null` arrowtype is DOT's default `normal`, emitted by omitting the attribute — head and tail
    // are handled the same way (the tail's `dir=both` already yields a normal tail when none is named).
    const head = ARROWTYPE[edge.toEnd];
    if (head !== null) attrs.push(`arrowhead=${head}`);
    if (edge.fromEnd !== "none") {
      attrs.push("dir=both");
      const tailArrow = ARROWTYPE[edge.fromEnd];
      if (tailArrow !== null) attrs.push(`arrowtail=${tailArrow}`);
    }
    const tail = attrs.length === 0 ? "" : ` [${attrs.join(", ")}]`;
    lines.push(`  "${esc(edge.from)}" -> "${esc(edge.to)}"${tail};`);
  }
  lines.push("}", "");
  return lines.join("\n");
};
