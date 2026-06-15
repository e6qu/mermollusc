# @m/layout — status

**State:** flowchart layout + relax (semi-interactive) implemented; `make check` green.

- `layout(ast, seed?)` → `Promise<Result<Scene, LayoutError>>` (shell). A non-empty `seed`
  (node → current position) runs ELK semi-interactive layered layout — relaxing around the
  manual positions; an empty seed (the default) is a clean layout (regenerate).
- core uses a typed `LayoutConfig`; the string-keyed ELK option bag is built only in the shell.
- core (pure): `toElkGraph(ast, seed)` and `toScene(positioned, ast)`.
- tests: 5 passing (toElkGraph/toScene; clean layout; relax flips order when seeded).
