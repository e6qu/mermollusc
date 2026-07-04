import type {
  EdgeKind,
  FlowNode,
  FlowSubgraph,
  FlowchartAst,
  NodeId,
  NodeShape,
} from "@m/contracts";

const wrapLabel = (shape: NodeShape, id: string, label: string): string => {
  switch (shape) {
    case "rect":
      return `${id}[${label}]`;
    case "round":
      return `${id}(${label})`;
    case "stadium":
      return `${id}([${label}])`;
    case "diamond":
      return `${id}{${label}}`;
    case "circle":
      return `${id}((${label}))`;
    case "container":
      return `${id}[${label}]`; // C4 boundary; not emitted by the flowchart printer
    case "actor":
      return `${id}(${label})`; // synthetic (gitGraph branch heads); not emitted by the flowchart printer
  }
};

const arrowOf = (kind: EdgeKind): string => {
  switch (kind) {
    case "arrow":
      return "-->";
    case "open":
      return "---";
    case "dotted":
      return "-.->";
    case "thick":
      return "==>";
  }
};

export const print = (ast: FlowchartAst): string => {
  const lines = [`flowchart ${ast.direction}`];
  const nodeById = new Map<NodeId, FlowNode>(ast.nodes.map((n) => [n.id, n]));
  // A subgraph member is printed inside its block; everything else is a top-level node.
  const inSubgraph = new Set<NodeId>(ast.subgraphs.flatMap((s) => [...s.nodes]));
  const childrenOf = (parent: NodeId | null) => ast.subgraphs.filter((s) => s.parent === parent);

  const emitNode = (id: NodeId, indent: string): void => {
    const node = nodeById.get(id);
    if (node !== undefined) lines.push(`${indent}${wrapLabel(node.shape, node.id, node.label)}`);
  };
  // `subgraph id` when the title is just the id, else `subgraph id[title]`; members then nested
  // subgraphs, matching the parser's statements-then-subgraphs order so print→parse round-trips.
  const emitSubgraph = (sub: FlowSubgraph, indent: string): void => {
    lines.push(
      sub.label === sub.id
        ? `${indent}subgraph ${sub.id}`
        : `${indent}subgraph ${sub.id}[${sub.label}]`,
    );
    for (const member of sub.nodes) emitNode(member, `${indent}  `);
    for (const child of childrenOf(sub.id)) emitSubgraph(child, `${indent}  `);
    lines.push(`${indent}end`);
  };

  for (const node of ast.nodes) if (!inSubgraph.has(node.id)) emitNode(node.id, "  ");
  for (const sub of childrenOf(null)) emitSubgraph(sub, "  ");
  for (const edge of ast.edges) {
    const label = edge.label === null ? "" : `|${edge.label}|`;
    lines.push(`  ${edge.from} ${arrowOf(edge.kind)}${label} ${edge.to}`);
  }
  // Styling directives last, verbatim — they carry no geometry, so their position is irrelevant to
  // Mermaid; emitting them after the graph keeps print→parse a fixed point.
  for (const style of ast.styles) lines.push(`  ${style.raw}`);
  return `${lines.join("\n")}\n`;
};
