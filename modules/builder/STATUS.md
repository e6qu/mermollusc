# @m/builder — status

**State:** hit-testing + selection model implemented; `make check` green.

- core: `hitTest(scene, point)` → node/edge/`null` (bounds + edge proximity; nodes preferred).
- core: pure `Selection` + `selectOnly` / `toggle` / `isSelected` over hit targets.
- tests: 8 passing.
- Not yet: drag, sidecar overrides, two-way text patching.
