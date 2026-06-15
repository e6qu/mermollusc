# @m/builder — status

**State:** hit-testing, selection, overrides, and two-way text patching; `make check` green.

- core: `hitTest`; `Selection` (`selectOnly`/`toggle`/`isSelected`); overrides
  (`moveNode`/`clearOverride`/`applyOverrides`).
- two-way text edits over the parser source map: `patchSpan` (primitive), `relabelNode`
  (span splice / bare-node wrap), `addNode` / `connect` (append a node / edge line).
- tests: 18 passing.
- Not yet: delete node/edge; multi-select; DOM connect affordance.
