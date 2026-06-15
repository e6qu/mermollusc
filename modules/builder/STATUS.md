# @m/builder — status

**State:** geometric hit-testing implemented; `make check` green.

- core: `hitTest(scene, point)` → `{kind:"node"|"edge", id}` or `null` (nodes via `rectContains`,
  edges via point-to-segment distance; nodes preferred over edges).
- tests: 4 passing (node/edge/empty/precedence).
- Not yet: selection, drag, sidecar overrides, two-way text patching.
