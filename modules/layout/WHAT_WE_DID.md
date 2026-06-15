# @m/layout — work log

- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- Confirmed `elkjs@0.11.1` ships its own TypeScript types (`lib/elk-api.d.ts`); used the bundled
  node-safe entry `elkjs/lib/elk.bundled.js`.
- core: `toElkGraph` (FlowchartAst → ELK graph spec, layered, direction-mapped, heuristic node
  sizing) and `toScene` (decoded ELK result → branded `Scene`, fail-loud on AST mismatch).
- shell: `layout()` runs ELK and decodes its result via a Zod schema before handing to core.
- Added relax: `layout(ast, seed)` seeds node positions and runs ELK semi-interactive layered
  layout (verified empirically — a flipped seed flips the result). Replaced the string-keyed ELK
  option dict in core with a typed `LayoutConfig`; the option bag is assembled in the shell.
- tests: unit (toElkGraph/toScene) + integration (clean layout, relax) — 5 passing.
- Added `layoutSequence` (pure, no ELK): lane layout — actors row, vertical dashed lifelines
  (reusing SceneEdge self-edges), messages as horizontal arrows styled by `MessageKind`. +3 tests.
- Added `layoutDiagram(ast)` routing by `ast.kind` (flowchart → ELK, sequence → lane). +1 test.
