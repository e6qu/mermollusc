# @m/contracts — status

**State:** AST + SceneGraph IR defined (types only); `make check` green.

- AST: flowchart variant (`FlowNode`/`FlowEdge`/`FlowchartAst`, branded `NodeId`/`EdgeId`, closed unions); `DiagramAst` union.
- SceneGraph IR: `SceneNode`/`SceneEdge`/`Scene` over `@m/std` geometry, with node `shape` and containment via `parent`.
- `LayoutOverrides`: sidecar manual geometry (scene node → position/size/pinned).
- tests: none (pure type contracts).
