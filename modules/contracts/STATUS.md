# @m/contracts — status

**State:** AST + SceneGraph IR defined (types only); `make check` green.

- AST: flowchart + sequence + C4 + state + ER variants (`FlowchartAst` incl. `FlowSubgraph` grouping, `SequenceAst`,
  `C4Ast` with nesting via `parent` and an optional `C4Element.description`, `ErAst` whose entities
  carry `attributes: ErAttribute[]` (type/name/`ErKey[]`/comment)); `DiagramAst` discriminated union;
  branded ids, closed unions.
- SceneGraph IR: `SceneNode`/`SceneEdge`/`Scene` over `@m/std` geometry, with node `shape`, containment
  via `parent`, ER attribute compartments via `SceneNode.rows` (`string[] | null`), and per-end edge
  decorations via `SceneEdge.fromEnd`/`toEnd` (the `EdgeEnd` union: `none`/`arrow` + the four crow's-
  foot cardinalities).
- `LayoutOverrides`: sidecar manual geometry (scene node → position/size/pinned).
- `Groups`: sidecar editor grouping with required `label`, ordered members, and move-only lock.
- `SourceMap` (`TextSpan`/`NodeSpans`): AST id/label → source byte ranges for two-way patching.
- tests: none (pure type contracts).
