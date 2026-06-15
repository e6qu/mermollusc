# @m/renderer — status

**State:** Canvas2D renderer implemented; `make check` green.

- core (pure): `toDisplayList(scene)` → `DrawCmd[]` (box/diamond shapes, node labels, edge
  polylines with dashed/solid stroke + optional arrowhead, edge labels at the midpoint, and an
  `icon` command — glyph above the label — for nodes carrying a `SceneNode.icon`).
- shell: `paint(ctx, cmds, iconImages?)` executes the display list against a `Canvas2D` (structural
  subset of `CanvasRenderingContext2D`; a real 2D context is assignable). `iconImages` maps
  `${pack}/${name}` → a pre-rasterised `CanvasImageSource`; an icon with no image just skips its glyph.
- tests: 6 passing (display-list unit incl. icon; paint against a recording mock, incl. drawImage).
