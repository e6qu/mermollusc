# @m/builder — status

**State:** hit-testing, selection, overrides, and two-way text patching; `make check` green.

- core: `hitTest`; `Selection` (`selectOnly`/`toggle`/`isSelected`); overrides
  (`moveNode`/`clearOverride`/`applyOverrides`).
- two-way text edits: `patchSpan` (primitive), `relabelNode` (span splice / bare-node wrap),
  `addNode` / `connect` (append a node / edge line), `deleteNode` (remove decl + referencing
  edge lines; line-based, bracket-aware).
- tests: 20 passing.
- The app now wires these into affordances: shift-click multi-select → **Connect**; select +
  **Delete** key → `deleteNode`.
- Not yet: span-accurate delete; `deleteEdge` / change-direction.
