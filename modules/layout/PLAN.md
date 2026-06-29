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
- Trunk-routing merges fans of incident edges (minimum fan threshold of 2) on a node side into a shared trunk. Approaches from the other nodes to the trunk are routed using the A* maze router to prevent obstacle clipping, and the trunk line is dynamically placed in the middle of the available routing channel between the target node and the source endpoints.
- Unified `layoutStyle` options parameter on `layout` and `layoutDiagram` allowing diagram family-specific rendering modes (such as Classic Mermaid empty circles and straight lines for gitGraph, Relaxed message curves for sequence, Classic rects and straight spokes for mindmaps, and Donut charts for pie).
- Self-relations in c4/network/cloud are standardized to draw a 5-point right-angle loop at the top-right corner of the node, with the label positioned at the outer corner.
- Edge label decollision search in decollideEdgeLabels checks for overlaps against unrelated node and container group boundaries in the scene (excluding direct endpoint ancestors of each edge) to prevent labels from being placed directly over intervening nodes.
- Container-aware routing treats a container's visible title label as an obstacle even when an edge
  legitimately enters that container to reach a member, preventing connectors from cutting through group
  titles without forcing large detours around the whole container.
- Cross-boundary grouped-child edges choose sides from the containing group and ports from the actual
  child, so architecture links enter a tier from the tier-facing side while preserving precise child
  anchoring.
- Network and cloud demo-oriented layouts keep architecture diagrams tiered: ungrouped ingress nodes
  are placed before grouped zones in network layouts, and cloud top-level boxes wrap on a narrower row
  budget with larger inter-row lanes so public starter diagrams do not collapse into one congested band.
