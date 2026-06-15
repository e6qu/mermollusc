# @m/layout — status

**State:** flowchart layout + relax (semi-interactive) implemented; `make check` green.

- `layout(ast, seed?)` → `Promise<Result<Scene, LayoutError>>` (shell). A non-empty `seed`
  (node → current position) runs ELK semi-interactive layered layout — relaxing around the
  manual positions; an empty seed (the default) is a clean layout (regenerate).
- core uses a typed `LayoutConfig`; the string-keyed ELK option bag is built only in the shell.
- core (pure): `toElkGraph(ast, seed)` and `toScene(positioned, ast)`.
- `layoutSequence(ast)` (pure): actors row, vertical dashed lifelines, stacked message arrows.
- `layoutC4(ast)` (pure): nested-box layout — boundaries wrap their children; relations are
  straight centre-to-centre edges.
- `layoutBlock(ast)` (pure): row-major grid in a `columns`-wide uniform cell; straight
  centre-to-centre edges.
- `layoutNetwork(ast)` (pure): squarish (`ceil √n`) grid; undirected (arrowless) centre-to-centre links.
- `layoutDiagram(ast)` routes by family: flowchart → ELK (async); sequence/C4/block/network → pure.
- tests: 17 passing (toElkGraph/toScene; clean layout; relax; sequence; C4; block grid; network grid; routing).
