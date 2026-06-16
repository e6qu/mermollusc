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
- `layoutNetwork(ast)` (pure): squarish (`ceil √n`) grid; undirected (arrowless) centre-to-centre
  links; sets each node's `icon` ref from its kind (`{ pack: "arch", name: kind }`).
- `layoutCloud(ast)` (pure): recursive nested-box — groups render as containers wrapping children;
  each service leaf's kind maps to a vendored simple-icons glyph (`docker`/`postgresql`/`apachekafka`/
  `cloudflare`/`googlecloudstorage`); undirected links.
- All layouts take an optional `MeasureText` (label → px); the default is the char-width heuristic,
  the app injects a real canvas `measureText`. `layoutDiagram(ast, measure?)` / `layout(ast, seed,
  measure?)` thread it through.
- `layoutDiagram(ast)` routes by family: flowchart → ELK (async); the rest → pure layouts.
- tests: 24 passing (toElkGraph/toScene; clean layout; relax; sequence; C4; block/network grid;
  cloud nesting + icons; injected-measurer sizing; routing; property-based: block/network grids
  **and the ELK flowchart path** preserve ids + fit every box inside the extent).
