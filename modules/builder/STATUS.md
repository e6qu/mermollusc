# @m/builder — status

**State:** hit-testing, selection, overrides, and two-way text patching; `make check` green.

- core: `hitTest`; `Selection` (`selectOnly`/`toggle`/`isSelected`); overrides
  (`moveNode`/`clearOverride`/`applyOverrides`).
- two-way text edits: `patchSpan` (primitive), `relabelNode` (span splice / bare-node wrap),
  `addNode` / `connect` (append a node / edge line), `deleteNode` (remove decl + referencing
  edge lines), `deleteEdge` (remove a standalone `from <arrow> to` line) — both line-based, bracket-aware.
- tests: 27 passing (incl. property-based: `patchSpan` splice/reverse, `moveNode`/`applyOverrides`
  reposition-exactly-one, `addNode`/`deleteNode` text invariants; `deleteEdge` keep/skip cases).
- The app wires these into affordances: shift-click multi-select → **Connect**; **Delete** key →
  `deleteNode` for selected nodes and `deleteEdge` for a selected edge.
- Not yet: span-accurate delete (line-based heuristic for now); change-direction.
