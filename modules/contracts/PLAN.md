# @m/contracts — plan

AST and SceneGraph IR type definitions — the two seams of the pipeline.

## Rendering parity contracts

- Architecture diagrams carry semantic scene accents (`compute`, `data`, `network`, `security`, `ops`)
  instead of being flattened to generic boxes.
- Gantt source maps expose the full start field for both explicit dates and `after ...` dependencies so
  drag gestures can rewrite source text without guessing.

## Responsibility

- Own the pure TypeScript contracts that cross module boundaries: AST variants, SceneGraph IR,
  source spans, manual layout overrides, and sidecar groups.
- Stay type-only; parsing, layout, rendering, and editor behavior live downstream.

## Public API (stable surface)

- Branded AST ids and `DiagramAst`.
- `Scene`, `SceneNode`, `SceneNodeRole`, `SceneEdge`, and `SceneWedge`.
- `LayoutOverrides`, `Groups`, `Group`.
- `OverlayDoc`, including whole-map override replacement for regenerate flows that preserve pinned
  manual positions.
- Source span maps for two-way text patches.
