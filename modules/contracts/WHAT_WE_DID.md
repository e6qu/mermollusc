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
- Added the `C4Ast` variant (`C4Element` with `kind` + `parent` nesting, `C4Rel`); `DiagramAst` is
  now `FlowchartAst | SequenceAst | C4Ast`.
- Added `NodeShape` `"container"` (C4 boundaries) — rendered as an outline with a top label.
- Added `FlowSubgraph { id, label, parent, nodes }` and `FlowchartAst.subgraphs` for flowchart
  `subgraph … end` grouping (membership on the subgraph, nesting via `parent`, so `FlowNode` is
  unchanged).
- Added required sidecar `Group.label` for editor-owned group titles.
- Added optional `C4Element.description` (`string | null`) for the C4 description argument.
- Added the `StateAst` family — `StateNode` (kind `state`/`start`/`end`), `StateTransition`, branded
  `StateId`/`StateTransitionId` — plus `StateSource` (state + transition label spans), and added
  `StateAst` to the `DiagramAst` union.
- Added `StateComposite` (id/label/parent/member-state-ids, mirroring `FlowSubgraph`) and
  `StateAst.composites` for nested `state X { … }` composite states.
- Added the `ErAst` family — `ErEntity`, `ErRelationship` (normalised `ErCardinality` per end +
  identifying flag), branded `ErEntityId`/`ErRelId` — plus `ErSource`, and added `ErAst` to `DiagramAst`.
- Generalised edge ends for crow's-foot/UML markers: replaced `SceneEdge.arrow` (`EdgeArrow`) with
  `fromEnd`/`toEnd` of the new `EdgeEnd` union (`none`/`arrow`/`one`/`zeroOrOne`/`oneOrMany`/`zeroOrMany`);
  the four cardinalities are a subset of `EdgeEnd`, so an `ErCardinality` is assignable directly.
- Added `SceneNode.rows` (`readonly string[] | null`) for ER entity attribute compartments, and
  `ErEntity.attributes` (`ErAttribute` = type/name/`ErKey[]`/comment) for parsed attribute blocks.
