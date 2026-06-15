# @m/builder — status

**State:** hit-testing, selection, overrides, and two-way relabel implemented; `make check` green.

- core: `hitTest`; `Selection` (`selectOnly`/`toggle`/`isSelected`); overrides
  (`moveNode`/`clearOverride`/`applyOverrides`); `relabelNode` (two-way text patch).
- `relabelNode` rewrites only a node's label span (bracketed splice, bare wrap), preserving the
  rest of the file; verified by reparsing.
- tests: 15 passing.
- Not yet: DOM drag/edit wiring; add/delete/connect text patches; layout relax/regenerate.
