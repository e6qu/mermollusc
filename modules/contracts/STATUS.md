# @m/contracts — status

**State:** AST + SceneGraph IR defined (types only); `make check` green.

- AST: flowchart + sequence + C4 variants (`FlowchartAst` incl. `FlowSubgraph` grouping, `SequenceAst`,
  `C4Ast` with nesting via `parent`); `DiagramAst` discriminated union; branded ids, closed unions.
- SceneGraph IR: `SceneNode`/`SceneEdge`/`Scene` over `@m/std` geometry, with node `shape` and containment via `parent`.
- `LayoutOverrides`: sidecar manual geometry (scene node → position/size/pinned).
- `Groups`: sidecar editor grouping with required `label`, ordered members, and move-only lock.
- `SourceMap` (`TextSpan`/`NodeSpans`): AST id/label → source byte ranges for two-way patching.
- tests: none (pure type contracts).
