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
- Added the `ClassAst` family (UML class diagrams) — `ClassEntity` with `ClassMember[]`
  (visibility `+`/`-`/`#`/`~`, text, field/method kind), `ClassRel` with `ClassArrow` ends
  (`triangle`/`diamondFilled`/`diamondHollow`/`arrowOpen`/`none`) + a dashed flag — plus `ClassSource`,
  and added `ClassAst` to `DiagramAst`.
- Extended `EdgeEnd` with the UML heads (`arrowOpen`, `triangle`, `diamondFilled`, `diamondHollow`);
  `ClassArrow` is a subset so it assigns straight onto a `SceneEdge` end. Added `SceneNode.rowDivider`
  (`number | null`) for a UML class's field/method compartment split.
- Added the `RequirementAst` family (SysML requirement diagrams) — `ReqEntity` (`ReqKind` = the six
  requirement types or `element`, with `ReqField[]` key/value body lines), `ReqRel` (`ReqRelKind` =
  the seven verbs contains/copies/derives/satisfies/verifies/refines/traces) — plus `ReqSource`, and
  added `RequirementAst` to `DiagramAst`. No new scene fields needed (reuses `rows`/`rowDivider`).
- Added `ClassEntity.stereotype` (`string | null`) for a class `«interface»`/`«abstract»` annotation,
  and a general `SceneNode.subtitle` (`string | null`) — a small line drawn above a compartment box's
  title (widening the title band) — to render it.
- Added the **gitGraph** AST (`GitGraphAst`: `direction`, `branches`, resolved `commits` with
  `parents`/`tag`/`commitType`/`merge`) plus `GitCommitId`/`GitBranchName`/`GitDirection`/
  `GitCommitType` brands and a `GitGraphSource` (explicit-commit-id spans for inline relabel). Added
  `GitGraphAst` to the `DiagramAst` union and re-exported all of it through both barrels.
- Added the **timeline** AST (`TimelineAst`: optional `title`, `periods` each with a `section` name +
  `events`) plus `TimelinePeriodId`/`TimelineEventId` brands, `TimelineEvent`/`TimelinePeriod`, and a
  `TimelineSource` (period + event text spans). Added `TimelineAst` to `DiagramAst`; re-exported through
  both barrels.
- Added the **mindmap** AST (`MindmapAst`: `nodes` in pre-order, each with `shape`, indentation-derived
  `parent`, and `level`) plus a `MindmapNodeId` brand, the `MindmapShape` union, and a `MindmapSource`
  (node-label spans). Added `MindmapAst` to `DiagramAst`; re-exported through both barrels.
- Added a `SceneWedge` (filled circular sector — centre, radius, canvas-convention start/end angles,
  label, value, percent, colour index) and a required `wedges` array on `Scene` — the first SceneGraph
  primitive beyond nodes/edges, for radial diagrams. Every node/edge family sets `wedges: []`.
- Added the **pie** AST (`PieAst`: `title`, `showData`, `slices`) + `PieSliceId` brand, `PieSlice`, and
  a `PieSource` (slice-label spans). Added `PieAst` to `DiagramAst`; re-exported all through both barrels.
- `StateKind` gained `fork`/`join`/`choice` (Mermaid `<<fork>>`/`<<join>>`/`<<choice>>`); the layout
  maps them to bar (rect) / diamond shapes.
- `SceneEdge` gained `curved` (draw as a bowed bezier — mindmap spokes / gitGraph connectors) and
  `fromLabel`/`toLabel` (small per-end labels — class multiplicity). `ClassRel` gained `fromMult`/
  `toMult`; `StateAst` gained `notes` (`StateNote` = id/target/text).
- Added `sceneNodeId`/`sceneEdgeId` smart constructors in `src/shell` (the first runtime code in the
  types-only `contracts`), so layout cores mint Scene ids through them instead of raw `brand<…>`. Keeps
  the sanctioned `as` cast in a shell; `tools/guard-types.mjs` now bans raw `brand<…>` in `src/core`.
- Added the `OverlayDoc` port (`src/core/overlay-doc.ts`): the interface the editor drives the sidecar
  overlay through (overrides + groups + history + persist). Two implementations satisfy it — the app's
  local `createLocalDocument` and the Yjs-backed `@m/collab` session — so swapping local↔collaborative
  touches no call site.
- Refined-number types: `PieSlice.value` is now `Positive` and `BlockAst.columns` is `PositiveInt`
  (from `@m/std`) — a zero/negative/NaN slice or a zero/fractional grid width is no longer representable
  in the AST; the parser mints both through the smart constructors at the parse boundary.
- `SceneEdge.waypoints` is now `TwoOrMore<Point>` (≥2) — an edge always has two endpoints, so a segment
  can always be drawn; the `< 2` length guards in the renderer/app are no longer needed.
- `NodeSpans` gained `decl` (the whole `A[label]` declaration span, not just the inner label), so the
  builder can rewrite a flowchart node's shape brackets in place.
- Started the **Gantt** family contract: `GanttAst` (`title`, `dateFormat`, tasks) with `GanttTask`
  (`id`/`label`/`section`/`status`/`start`/`durationDays`), `GanttStatus`, a `GanttStart` union
  (`date` | `after <ref>`), and `GanttSource` (task-label spans). Deliberately **not** in the
  `DiagramAst` union yet — that activation lands once the layout/renderer/app pipeline can handle it,
  so each Gantt PR stays green (the exhaustive family switches would otherwise force it all at once).
- `SceneNode` gained a **required** `accent: NodeAccent` (`"none" | "muted" | "active" | "danger"`) — a
  semantic fill the renderer colours (a Gantt bar's status today). Made it an explicit closed-union
  member (`none`), not a nullable/optional field, so every node states its accent and the renderer
  handles every case exhaustively — no implicit default to forget or mis-test.
- `Scene` gained a **required** `decorations: readonly Decoration[]` — diagram "chrome" (a `rule` guide
  line or a standalone `caption`) drawn behind the content, for a Gantt's day-axis gridlines + date /
  section labels. A first-class, explicit list (empty for most families, like `wedges`), so a family
  that needs axis decoration doesn't smuggle it through fake nodes/edges.
- `GanttTask` gained `milestone: boolean` — a point-in-time event (`0d`), distinct from a duration task.
- `GanttStart`'s `after` variant now carries `refs: OneOrMore<GanttTaskId>` (was a single `ref`) — a
  task can wait on several predecessors (`after a b c`), starting at the latest one's end. Non-empty by
  type, so an `after` with no id is a parse error, never an empty list in the AST.
- `GanttAst` gained `excludesWeekends: boolean` + `excludeDates: readonly string[]` (raw holiday dates,
  resolved by the layout). Models Mermaid's `excludes weekends`/`excludes <date>` non-working days — both
  required/explicit (false / empty when absent), not optional flags.
- Added a `band` `Decoration` (a filled background `Rect` carrying a `BandFill` = `section`/`sectionAlt`/
  `excluded` closed union) — the first fill primitive in the decoration list. Drawn behind rules/captions
  (array order), it backs a Gantt's section zebra stripes and excluded-day columns. `BandFill` re-exported.
- `GanttAst` gained a **required** `tickIntervalDays: PositiveInt` (axis gridline/caption spacing). Required
  and always concrete — the parser resolves the default (weekly = 7) at the boundary, so the layout reads a
  real value with no `?? 7` fallback in the core (explicit over nullable/optional).
