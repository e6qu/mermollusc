# @m/builder — status

**State:** hit-testing, selection, and sidecar overrides implemented; `make check` green.

- core: `hitTest`; `Selection` (`selectOnly`/`toggle`/`isSelected`); overrides
  (`moveNode`/`clearOverride`/`applyOverrides`).
- `applyOverrides` repositions overridden node boxes immediately; edges re-route on relayout.
- tests: 12 passing.
- Not yet: DOM drag wiring; layout consuming overrides (relax/regenerate); two-way text patching.
