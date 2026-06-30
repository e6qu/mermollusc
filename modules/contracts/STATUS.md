# @m/contracts — status

**State:** AST + SceneGraph IR defined (types only); `make check` green.

**Current rendering-contract note:** semantic architecture accents are in `NodeAccent`, `StateAst`
carries layout direction, `EdgeStyle` carries movable label ratios, and `GanttSource` includes
`taskStartField` for explicit and dependency start rewrites.

- AST: all fifteen family variants — flowchart + sequence + C4 + block + network + cloud + state + ER
  + class + requirement + gitGraph + timeline + mindmap + pie + Gantt (`FlowchartAst` incl.
  `FlowSubgraph` grouping, `SequenceAst`, `C4Ast` with nesting + optional `C4Element.description`,
  `BlockAst`/`NetworkAst`/`CloudAst` whose nodes carry an optional `icon: IconRef | null` override
  (cloud also nests via `CloudGroup`, and `CloudLink.directed` marks `-->` traffic edges),
  `StateAst` with direction + composites + notes, `ErAst` with
  `attributes: ErAttribute[]`, `ClassAst` with `members: ClassMember[]` + `ClassArrow` ends,
  `RequirementAst` whose entities carry a `ReqKind` + `ReqField[]` and relationships a `ReqRelKind`
  verb, `GitGraphAst` (commits/branches), `TimelineAst` (periods/events), `MindmapAst` (hierarchy),
  `PieAst` with `showData` + `donut`, `GanttAst` with sections/tasks + resolved working-day
  directives); `DiagramAst` discriminated union; branded ids, closed unions.
- SceneGraph IR: `SceneNode`/`SceneEdge`/`Scene` over `@m/std` geometry, with node `shape`, containment
  via `parent`, compartment rows via `SceneNode.rows` (`string[] | null`) + a field/method split via
  `rowDivider` (`number | null`) + an above-title `subtitle` (`string | null`, a class stereotype),
  semantic node rendering roles via `SceneNode.role` (`normal` plus state pseudo-state/note roles),
  and per-end edge decorations via `SceneEdge.fromEnd`/`toEnd` (the
  `EdgeEnd` union: `none`/`arrow`/`arrowOpen`/`triangle`/`diamondFilled`/`diamondHollow` + the four
  crow's-foot cardinalities), plus an optional `SceneEdge.labelPos` — a router-supplied label centre
  (ELK reserves space for edge labels) the renderer prefers over the routed midpoint. Pie wedges carry
  `innerRadius`, so full pies and donuts share one
  primitive.
- `LayoutOverrides`: sidecar manual geometry (scene node → position/size/pinned).
- `EdgeStyle`: sidecar edge route plus optional `labelT`, a relative label position along the route.
- `Groups`: sidecar editor grouping with required `label`, ordered members, and move-only lock.
- `SourceMap` (`TextSpan`/`NodeSpans`): AST id/label → source byte ranges for two-way patching.
- `StateNote.side`: parsed `right`/`left`/`over` note placement intent preserved for layout.
- tests: none (pure type contracts).
