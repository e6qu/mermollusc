import type { DiagramAst } from "@m/contracts";
import { EXAMPLES } from "./examples.js";

// In-app syntax reference: one entry per diagram family, exhaustive over the closed `DiagramAst` kind
// union (a new family won't compile until it's named here) and pointing at the real, test-covered
// starter in `EXAMPLES` — so the reference can't drift from what actually parses. Rendered into the
// help overlay as collapsible snippets; the Examples menu remains the one-click loader.
const SYNTAX_FAMILIES: Record<DiagramAst["kind"], string> = {
  flowchart: "Flowchart",
  sequence: "Sequence",
  c4: "C4 context",
  block: "Block",
  network: "Network",
  cloud: "Cloud",
  state: "State",
  er: "Entity–relationship",
  class: "Class",
  requirement: "Requirement",
  gitGraph: "Git graph",
  timeline: "Timeline",
  mindmap: "Mind map",
  pie: "Pie",
  gantt: "Gantt",
};

export const buildSyntaxReference = (): void => {
  const list = document.querySelector<HTMLElement>("#syntax-list");
  if (list === null) return;
  const entries: ReadonlyArray<readonly [string, string]> = [
    ...Object.entries(SYNTAX_FAMILIES),
    ["dot", "DOT / Graphviz import"],
  ];
  for (const [key, label] of entries) {
    const snippet = EXAMPLES.get(key);
    if (snippet === undefined) continue;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = label;
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = snippet.trimEnd();
    pre.append(code);
    details.append(summary, pre);
    list.append(details);
  }
};
