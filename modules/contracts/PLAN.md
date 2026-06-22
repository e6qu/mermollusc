# @m/contracts — plan

AST and SceneGraph IR type definitions — the two seams of the pipeline.

## Responsibility

- Own the pure TypeScript contracts that cross module boundaries: AST variants, SceneGraph IR,
  source spans, manual layout overrides, and sidecar groups.
- Stay type-only; parsing, layout, rendering, and editor behavior live downstream.

## Public API (stable surface)

- Branded AST ids and `DiagramAst`.
- `Scene`, `SceneNode`, `SceneNodeRole`, `SceneEdge`.
- `LayoutOverrides`, `Groups`, `Group`.
- Source span maps for two-way text patches.
