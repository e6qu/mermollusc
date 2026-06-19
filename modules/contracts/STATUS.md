# @m/contracts — status

**State:** AST + SceneGraph IR defined (types only); `make check` green.

- AST: flowchart + sequence + C4 + state + ER + class + requirement variants (`FlowchartAst` incl.
  `FlowSubgraph` grouping, `SequenceAst`, `C4Ast` with nesting + optional `C4Element.description`,
  `ErAst` with `attributes: ErAttribute[]`, `ClassAst` with `members: ClassMember[]` + `ClassArrow`
  ends, `RequirementAst` whose entities carry a `ReqKind` + `ReqField[]` and relationships a
  `ReqRelKind` verb); `DiagramAst` discriminated union; branded ids, closed unions.
- SceneGraph IR: `SceneNode`/`SceneEdge`/`Scene` over `@m/std` geometry, with node `shape`, containment
  via `parent`, compartment rows via `SceneNode.rows` (`string[] | null`) + a field/method split via
  `rowDivider` (`number | null`) + an above-title `subtitle` (`string | null`, a class stereotype),
  and per-end edge decorations via `SceneEdge.fromEnd`/`toEnd` (the
  `EdgeEnd` union: `none`/`arrow`/`arrowOpen`/`triangle`/`diamondFilled`/`diamondHollow` + the four
  crow's-foot cardinalities).
- `LayoutOverrides`: sidecar manual geometry (scene node → position/size/pinned).
- `Groups`: sidecar editor grouping with required `label`, ordered members, and move-only lock.
- `SourceMap` (`TextSpan`/`NodeSpans`): AST id/label → source byte ranges for two-way patching.
- tests: none (pure type contracts).
