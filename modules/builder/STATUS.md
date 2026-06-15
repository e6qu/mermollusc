# @m/builder — status

**State:** hit-testing, selection, overrides, and two-way text patching; `make check` green.

- core: `hitTest`; `Selection` (`selectOnly`/`toggle`/`isSelected`); overrides
  (`moveNode`/`clearOverride`/`applyOverrides`).
- two-way text edits: `patchSpan` (primitive), `relabelNode` (span splice / bare-node wrap),
  `addNode` / `connect` (append a node / edge line), `deleteNode` (remove decl + referencing
  edge lines; line-based, bracket-aware).
- tests: 20 passing.
- Not yet: span-accurate delete; multi-select + DOM connect/delete affordances in the app.
