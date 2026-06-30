# @m/builder — status

**State:** hit-testing, selection, overrides, and two-way text patching; `make check` green.

**Current Gantt note:** `setGanttStartFromDay` rewrites an `after ...` start field into an explicit date
for drag gestures that already know the resolved calendar day.

- core: `hitTest`; `Selection` (`selectOnly`/`toggle`/`isSelected`); overrides
  (`moveNode`/`resizeNode`/`clearOverride`/`applyOverrides` — moving nodes re-anchors their connectors
  and grows the extent so dragged-out nodes aren't clipped; `resizeNode` pins position + size for
  manual node sizing; a uniformly-moved group keeps its edge routes; side-centre mount snapping is
  opt-in for box-style diagram families).
- core: `applyStyles` handles sidecar edge presentation (`route`, `routeOption`, `labelT`), including
  recomputing a moved label from its route-relative ratio after straightening, A* reroute, or redraw, and
  preserving cardinal endpoint mounts even when no style override exists.
- two-way text edits: `patchSpan` (primitive), `relabelNode` (span splice / bare-node wrap),
  `addNode` / `connect` (append a node / edge line), `deleteNode` (remove decl + referencing
  edge lines), `deleteEdge` (remove a standalone `from <arrow> to` line), C4 element/relation
  deletion (including boundary blocks + nested relations), and sequence actor/message deletion —
  line-based, bracket-aware where labels can collide with ids.
- label safety: `validateLabel(label, context)` (pure/total `Result`) rejects the delimiter that
  would terminate a label token early — `\n` always; `]`/`)`/`}` for `flowchartBracket`; `|` for
  `pipe` (flowchart/network/cloud/block edge labels); `"` for `quoted` (C4). `relabelNode`/`reshapeNode`
  validate against the node shape's own closer (`reshape` against the target shape; `relabel` against
  all bracket closers, since the span doesn't record the existing shape) before splicing, so neither
  can write un-parseable source.
- snap geometry (core): `snapAxis(edges, targets)` → `{ delta, line }` (closest candidate within
  `SNAP_T`, first-seen-wins on a tie) and `snapCandidates(nodes, exceptId)` → other nodes'
  left/centre/right xs + top/middle/bottom ys; `SNAP_T` = 6 px. Moved verbatim from the app shell.
- tests: 53 unit + 79 integration passing (incl. property-based: `patchSpan` splice/reverse, `moveNode`/`applyOverrides`
  reposition-exactly-one, `addNode`/`deleteNode` text invariants, `deleteEdge` keep/skip cases,
  parser-backed `relabelNode` (span-accurate, others untouched) + `connect` (one edge, nodes kept),
  `relabelNode` never-corrupts (round-trips through parse OR returns err), `validateLabel` per-context
  terminator rejection, and `snapAxis`/`snapCandidates` tolerance/tie-break/no-candidate invariants).
- groups (sidecar, in `@m/contracts`): `group`/`ungroup`/`setLocked`/`setGroupLabel`/`pruneGroups` + `parentOf`/`leafNodes`/
  `topGroupOfNode`/`pathLocked`/`topGroups` — nestable, member-ordered, move-only lock; never in text.
- The app wires these into affordances: shift-click multi-select → **Connect**; **Delete** key →
  family-specific node/element/actor and edge/relation/message removal.
- Not yet: span-accurate delete (line-based heuristic for now); change-direction.
