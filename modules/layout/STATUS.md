# @m/layout — status

**State:** flowchart layout + relax (semi-interactive) implemented; `make check` green.

- `layout(ast, seed?)` → `Promise<Result<Scene, LayoutError>>` (shell). A non-empty `seed`
  (node → current position) runs ELK semi-interactive layered layout — relaxing around the
  manual positions; an empty seed (the default) is a clean layout (regenerate).
- core uses a typed `LayoutConfig`; the string-keyed ELK option bag is built only in the shell.
- core (pure): `toElkGraph(ast, seed)` and `toScene(positioned, ast)`.
- `layoutSequence(ast)` (pure, no ELK): actors in a row, vertical dashed lifelines, messages as
  horizontal arrows stacked in order → `Scene`.
- tests: 8 passing (toElkGraph/toScene; clean layout; relax; sequence lane layout).
