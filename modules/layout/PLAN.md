# @m/layout — plan

`AST → positioned SceneGraph`, with ELK behind a typed, decoded shell facade.

## Responsibility

- Owns graph layout: turns a `@m/contracts` AST into a positioned `Scene`.
- Running ELK is IO-shaped (async, external engine), so it lives in `src/shell`; the graph
  construction and result→Scene mapping are pure and live in `src/core`.
- Does NOT parse or render.

## Public API (stable surface)

- `layout(ast: FlowchartAst): Promise<Result<Scene, LayoutError>>` — fail-loud.
- `toElkGraph` / `toScene` (pure) are exported for testing and reuse.

## Notes

- Uses the bundled `elkjs/lib/elk.bundled.js` so layout runs in node and the browser without a
  separate worker file. The app may inject a `workerFactory` later to offload to a Web Worker.
- Node sizing is a heuristic; once the renderer can measure text, sizes should come from it.
- The `LayoutOverrides` contract (pinned positions, "relax" seeds) is not consumed yet.
