# @m/layout — status

**State:** flowchart layout implemented; `make check` green.

- `layout(ast)` → `Promise<Result<Scene, LayoutError>>` (shell): builds the ELK graph, runs
  `elkjs` (bundled, node-safe), decodes the result with Zod, maps to a branded `Scene`.
- core (pure): `toElkGraph(ast)` and `toScene(positioned, ast)`.
- tests: 4 passing (toElkGraph/toScene unit; real ELK layout integration).
