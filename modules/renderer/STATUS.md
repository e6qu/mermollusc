# @m/renderer — status

**State:** Canvas2D renderer implemented; `make check` green.

- core (pure): `toDisplayList(scene)` → `DrawCmd[]` (box/diamond shapes, centered labels, edge
  polylines with dashed/solid stroke + optional arrowhead).
- shell: `paint(ctx, cmds)` executes the display list against a `Canvas2D` (structural subset of
  `CanvasRenderingContext2D`; a real 2D context is assignable).
- tests: 4 passing (display-list unit; paint against a recording mock context).
