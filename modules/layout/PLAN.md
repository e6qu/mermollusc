# @m/layout — plan

`AST → positioned SceneGraph`, with ELK behind a typed, decoded shell facade.

## Responsibility

- Owns graph layout: turns a `@m/contracts` AST into a positioned `Scene`.
- Running ELK is IO-shaped (async, external engine), so it lives in `src/shell`; the graph
  construction and result→Scene mapping are pure and live in `src/core`.
- Does NOT parse or render.

## Public API (stable surface)

- `layout(ast, seed, measure): Promise<Result<Scene, LayoutError>>` — fail-loud flowchart layout with
  explicit manual-position seed and text metric.
- `toElkGraph` / `toScene` (pure) are exported for testing and reuse.
- `layoutDiagram(ast, measure)` preserves family-specific Scene semantics such as state node roles
  while sharing the generic ELK path where appropriate.

## Notes

- Uses the bundled `elkjs/lib/elk.bundled.js` so layout runs in node and the browser without a
  separate worker file. The app may inject a `workerFactory` later to offload to a Web Worker.
- Node sizing is a heuristic; callers that need visual fidelity pass the same `MeasureText` they use
  for the active renderer theme.
- `LayoutOverrides` seeds are consumed by the flowchart relax path.
- Family post-passes may refine shared layout output when the source carries semantic geometry, such
  as state-note side placement.
- Edge routing cost function splits crossings (low weight, `CROSSING_COST = 10`) and overlaps (high weight, `OVERLAP_COST = 150`) in both greedy sweeps and ILS passes to favor short paths with minor crossings over long outer detours while strictly avoiding parallel line overlaps.
