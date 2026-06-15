import type { LayoutOverrides, Scene, SceneNode, SceneNodeId } from "@m/contracts";
import type { Point } from "@m/std";

export const moveNode = (
  overrides: LayoutOverrides,
  id: SceneNodeId,
  position: Point,
): LayoutOverrides => {
  const next = new Map(overrides);
  next.set(id, { position, size: overrides.get(id)?.size ?? null, pinned: true });
  return next;
};

export const clearOverride = (overrides: LayoutOverrides, id: SceneNodeId): LayoutOverrides => {
  if (!overrides.has(id)) return overrides;
  const next = new Map(overrides);
  next.delete(id);
  return next;
};

// Repositions overridden node boxes immediately. Edge waypoints are left stale until the next
// relayout (relax / regenerate) re-routes them.
export const applyOverrides = (scene: Scene, overrides: LayoutOverrides): Scene => {
  if (overrides.size === 0) return scene;
  const nodes = scene.nodes.map((node): SceneNode => {
    const override = overrides.get(node.id);
    if (override === undefined) return node;
    return {
      ...node,
      bounds: { origin: override.position, size: override.size ?? node.bounds.size },
    };
  });
  return { ...scene, nodes };
};
