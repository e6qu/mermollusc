import type { EdgeKind, FlowchartAst, NodeShape } from "@m/contracts";

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
  for (const node of ast.nodes) {
    lines.push(`  ${wrapLabel(node.shape, node.id, node.label)}`);
  }
  for (const edge of ast.edges) {
    const label = edge.label === null ? "" : `|${edge.label}|`;
    lines.push(`  ${edge.from} ${arrowOf(edge.kind)}${label} ${edge.to}`);
  }
  return `${lines.join("\n")}\n`;
};
