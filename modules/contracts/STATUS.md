# @m/contracts — status

**State:** AST + SceneGraph IR defined (types only); `make check` green.

- AST: flowchart variant (`FlowNode`/`FlowEdge`/`FlowchartAst`, branded `NodeId`/`EdgeId`, closed unions); `DiagramAst` union.
- SceneGraph IR: `SceneNode`/`SceneEdge`/`Scene` over `@m/std` geometry, with node `shape` and containment via `parent`.
- `LayoutOverrides`: sidecar manual geometry (scene node → position/size/pinned).
- `SourceMap` (`TextSpan`/`NodeSpans`): AST id/label → source byte ranges for two-way patching.
- tests: none (pure type contracts).
