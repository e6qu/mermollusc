import type { SceneEdgeId, SceneNodeId } from "@m/contracts";
import type { HitTarget } from "./hit.js";

export interface Selection {
  readonly nodes: ReadonlySet<SceneNodeId>;
  readonly edges: ReadonlySet<SceneEdgeId>;
}

export const emptySelection: Selection = { nodes: new Set(), edges: new Set() };

export const selectOnly = (target: HitTarget | null): Selection => {
  if (target === null) return emptySelection;
  return target.kind === "node"
    ? { nodes: new Set([target.id]), edges: new Set() }
    : { nodes: new Set(), edges: new Set([target.id]) };
};

export const toggle = (selection: Selection, target: HitTarget): Selection => {
  if (target.kind === "node") {
    const nodes = new Set(selection.nodes);
    if (nodes.has(target.id)) {
      nodes.delete(target.id);
    } else {
      nodes.add(target.id);
    }
    return { nodes, edges: selection.edges };
  }
  const edges = new Set(selection.edges);
  if (edges.has(target.id)) {
    edges.delete(target.id);
  } else {
    edges.add(target.id);
  }
  return { nodes: selection.nodes, edges };
};

export const isSelected = (selection: Selection, target: HitTarget): boolean =>
  target.kind === "node" ? selection.nodes.has(target.id) : selection.edges.has(target.id);
