# @m/builder — status

**State:** hit-testing, selection, overrides, and two-way text patching; `make check` green.

- core: `hitTest`; `Selection` (`selectOnly`/`toggle`/`isSelected`); overrides
  (`moveNode`/`resizeNode`/`clearOverride`/`applyOverrides` — moving nodes re-anchors their connectors
  and grows the extent so dragged-out nodes aren't clipped; `resizeNode` pins position + size for
  manual node sizing; a uniformly-moved group keeps its edge routes).
- two-way text edits: `patchSpan` (primitive), `relabelNode` (span splice / bare-node wrap),
  `addNode` / `connect` (append a node / edge line), `deleteNode` (remove decl + referencing
  edge lines), `deleteEdge` (remove a standalone `from <arrow> to` line), C4 element/relation
  deletion (including boundary blocks + nested relations), and sequence actor/message deletion —
  line-based, bracket-aware where labels can collide with ids.
- tests: 51 passing (incl. property-based: `patchSpan` splice/reverse, `moveNode`/`applyOverrides`
  reposition-exactly-one, `addNode`/`deleteNode` text invariants, `deleteEdge` keep/skip cases, and
  parser-backed `relabelNode` (span-accurate, others untouched) + `connect` (one edge, nodes kept)).
- groups (sidecar, in `@m/contracts`): `group`/`ungroup`/`setLocked`/`setGroupLabel` + `parentOf`/`leafNodes`/
  `topGroupOfNode`/`pathLocked`/`topGroups` — nestable, member-ordered, move-only lock; never in text.
- The app wires these into affordances: shift-click multi-select → **Connect**; **Delete** key →
  family-specific node/element/actor and edge/relation/message removal.
- Not yet: span-accurate delete (line-based heuristic for now); change-direction.
