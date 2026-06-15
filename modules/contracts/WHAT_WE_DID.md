# @m/contracts — work log

- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- Defined the AST contract (flowchart variant + `DiagramAst` union) with branded ids and closed unions.
- Defined the SceneGraph IR contract (`Scene`/`SceneNode`/`SceneEdge`) over `@m/std` geometry.
- Added `SceneNode.shape` (reusing `NodeShape`) so the renderer can draw shapes; layout sets it.
- Added the `LayoutOverrides` contract (sidecar manual geometry: scene node → position/size/pinned).
- Added the `SourceMap` contract (`TextSpan`, `NodeSpans`): AST id/label → source byte ranges.
- Added the `SequenceAst` variant (actors, messages, `ActorId`/`MessageId`/`MessageKind`); the
  `DiagramAst` union is now `FlowchartAst | SequenceAst`.
- Added `SceneEdge.stroke` (`solid`/`dashed`) + `arrow` (`none`/`filled`) so the renderer can
  draw dashed lines and arrowheads (and so sequence messages/lifelines are expressible).
- Added the `SequenceSource` contract (actor-label + message-text spans) for sequence two-way edits.
