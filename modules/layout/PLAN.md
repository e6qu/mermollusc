# @m/layout — plan

`AST → positioned SceneGraph`, with ELK behind a typed, decoded shell facade.

## Architecture diagram layout

- Treat network and cloud as first-class architecture families: network root zones read left-to-right,
  while cloud keeps wider tier rows for edge/routing/service/data/security/ops demos.
- Keep network/cloud default glyphs on provenance-tracked vendor packs; the authored `arch` pack remains
  available through explicit icon refs, but network defaults should not depend on it.
- Preserve state-diagram `direction` through the shared flowchart/ELK layout path.
- Keep timeline event connectors as real scene edges so manual drag overrides move visible links with the
  event nodes.
- Keep connector endpoints on cardinal node mounts. Parallel fan-out belongs in external lanes and
  trunks, not on arbitrary side coordinates; `cardinalMountViolations` is the shared invariant for CI
  and app catalog checks.

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
- `cardinalMountViolations(scene)` / `edgesUseCardinalMounts(scene)` — pure route-endpoint invariant
  helpers for graph families whose connectors must land on top/bottom/left/right mounts.

## Notes

- Uses the bundled `elkjs/lib/elk.bundled.js` so layout runs in node and the browser without a
  separate worker file. The app may inject a `workerFactory` later to offload to a Web Worker.
- **Defined-geometry boundary contract for degenerate routes:** ELK can occasionally return an edge
  section with fewer than two points. `routeWaypoints` then derives a straight line between the two
  endpoint centres — this is a boundary contract producing real, drawable geometry from data the router
  failed to provide, not a silent fallback in the §0.1 sense: nothing is hidden (the edge still draws,
  attached to its true endpoints), and failing the WHOLE diagram with a `LayoutError` over one
  degenerate internal section would punish the user for a router artifact they can't act on.
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
- Label measurement treats both actual newlines and literal `\n` sequences as line breaks, matching the
  renderer's display behavior.
- ELK/compartment box families use side-centre mount points (top, bottom, left, right) as a post-layout
  routing cleanup; architecture spread families and non-box semantic families keep their own routers.
