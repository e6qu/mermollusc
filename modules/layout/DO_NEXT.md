# @m/layout — do next

- Wire relax/regenerate buttons in the app (pass the current scene positions as the seed).
- Refine regenerate to re-layout only *unpinned* nodes (ELK can't cleanly fix a subset; needs a
  per-node fixed-position approach or post-pass).
- *(done)* The app now measures with the *active* theme font (incl. the wider sketch font) and
  re-lays out when the Sketch toggle flips, so labels stay inside their boxes in both modes.
- Extend property tests: no node-box overlap, edges terminate near nodes (ids-preserved + boxes-
  within-extent are covered for block/network grids and the ELK flowchart path).
- *(done)* DRY sweep: the duplicated label-width / `widestLine` idioms and the block/network grid
  geometry are now shared `core/measure.ts` (`widestLine`/`clampedWidth`) and `core/grid.ts`
  (`gridGeometry`); the `elk.ts` catch idiom uses `@m/std`'s `messageOf`. (Geometry-only — no
  callback layout engine, since the per-family node/edge construction diverges too much.)
- *(done)* Flowchart `subgraph` nesting lays out via ELK hierarchy (compound nodes + absolute-coord
  flattening). C4/cloud use their own pure nested-box layout.
- *(done)* All five pure layouts (`sequence`/`c4`/`cloud`/`block`/`network`) now return
  `Result<Scene, LayoutError>` and fail loudly on an internally-inconsistent AST: an edge/relation/
  message/link whose endpoint isn't a known node, or (c4/cloud) an element whose `parent` is dangling
  or cyclic so it was never placed. The silent `?? 0` / `?? {default box}` / dropped-edge `continue`
  fallbacks are gone. The idiomatic `?? []` multimap builds stay — an empty child list is a valid
  state, not a masked error.
- *(done)* The ER/class/requirement compartment layouts share one `layoutCompartments` engine
  (`CompartmentBox`/`CompartmentEdge` specs + per-family metrics) instead of three copies of the ELK
  boilerplate. A future compartment family is now a small AST→spec mapper.
- *(done)* State diagrams preserve semantic Scene roles after `stateToFlow`, so start/end markers,
  fork/join bars, and notes can render distinctly while still sharing the ELK flowchart path.
- *(done)* State note side is now honoured after ELK layout: `right`, `left`, and `over` notes are
  placed on the requested side and their note connectors are re-anchored.
- gitGraph: *(done — deterministic lane layout, LR/TB/BT; label-sized rounded pills; branch/merge
  connectors are curved beziers)*. Follow-up: orthogonal (elbow) routing as an alternative style.
- timeline: *(done — column layout with a period spine, stacked events, section bands)*. Follow-up:
  alternate event cards above/below the spine (Mermaid-style) once a family-aware renderer pass exists.
- mindmap: *(done — dedicated **radial** engine `layoutMindmap`: leaf-weighted angular sectors, depth →
  radius, forest rings a virtual hub)*. Follow-up: collision-avoidance for very wide labels at the same radius. (curved spokes: done)
- pie: *(done — radial wedge layout, slices clockwise from 12 o'clock; **side legend** with colour-disc
  swatches + `showData` raw values; on-slice label is just the percentage; the legend **wraps into
  columns** when it would run past the disc; `donut` adds an inner radius to slices only)*.

- *(done)* **ELK now reserves space for edge labels.** `toElkGraph`/the compartment graph pass each
  edge's measured label box into ELK (`edgeLabels.placement: CENTER`), and ELK's returned label centre
  rides through `PositionedEdge.labelPos` → `SceneEdge.labelPos`; the renderer uses it when present and
  falls back to the routed midpoint otherwise. Flowchart/state/class/ER/requirement labels now clear
  the nodes (the BPMN gateway overlaps are gone).

## Layout-algorithm direction (see LAYOUT_RESEARCH.md)
Spike done. Recommendation: NO bespoke force/annealing engine (breaks determinism + two-way stability).
Sequenced, deterministic wins instead: (1) port assignment in route.ts to fix edge overlap at branch
nodes; (2) expose `elk.layered.edgeRouting` + edge spacing; (3) per-family `elk.algorithm` selector
(layered/stress/mrtree/radial) reusing elkjs's built-in algorithms.

## Edge-routing (LAYOUT_RESEARCH steps 1–2: DONE)
Deterministic port assignment (`spreadPorts`) shipped for cloud/block; ELK edge spacing tuned. Remaining:
extend `spreadPorts` to network/c4 (currently centre-to-centre straight lines), and obstacle-avoidance so
a spread lane doesn't cross an intervening node (step 3 — the larger piece).


## Energy-aware layout — next slices (plan agreed: deterministic candidate-and-select, opt-in)
PR 1 (metric + family-agnostic invariants + baseline) is in. Next:
- PR 2: a "Tidy layout" opt-in toggle. When on, the layered families (flowchart/state/er/class/req) run a
  few DETERMINISTIC ELK candidates (varying `considerModelOrder` / `crossingMinimization`), each filtered
  through its style invariant, and `lowestEnergy` picks the survivor. Default output unchanged (no golden
  churn). Add family-specific invariants where the family is known (sequence row, gantt axis, pie 2π…).
- PR 3 (optional): gitGraph lane / mindmap angular ordering candidates; opt-in ELK `stress` algorithm.
Refine the timeline-spine false positive (axis edge) in the metric if it ever drives selection.

## Energy-aware layout — after PR 2 (the "Tidy layout" opt-in select shipped)
Remaining: family-specific invariants as extra test guards (sequence row, gantt axis, pie 2π — the
layered families already gate on the generic `styleOk`); gitGraph lane / mindmap angular ordering
candidates; optional ELK `stress` algorithm; widen the tidy candidate set if measurements warrant.

## Energy-aware layout — after PR 3 (gitGraph lane-tidy shipped)
Remaining (lower priority): family-specific style invariants need family context the generic Scene lacks
— e.g. a pie's slice wedges are indistinguishable from its legend-swatch wedges at the Scene level, so a
"slices tile 2π" guard must live where the family is known (the pie layout/shell), not in `invariants.ts`.
Also still open: an opt-in ELK `stress` algorithm (a genuinely different, force-like style — only worth
it if a free-form look is ever wanted; it would NOT be a default, to preserve each family's style).







## Crossing optimiser: culling + barycenter shipped
Done: obstacle culling (the effective perf fix — the maze-candidate cache turned out marginal) + density-
scaled ILS; barycenter lane ordering for gitGraph beyond the brute-force cap. The ELK/spreadPorts families
already have barycenter ordering, so there's no further complementary pass to add there.

## Edge overlap separation shipped
The optimiser now treats parallel overlaps (stacked collinear segments) as conflicts, not just
perpendicular crossings — the dominant fault on dense architecture diagrams (cloud/network/c4/block).
Possible next: weight overlaps vs crossings (overlaps hide edges, crossings stay readable) if a future
diagram trades too many crossings for de-stacking; a dedicated channel-lane assignment pass could
de-overlap without the maze reroute's incidental crossings.

## Channel reservation + lane separation shipped
The stacked-edge fix is now two cooperating passes in `spreadPorts`: `reserveChannels` (density-sized room)
then `separateOverlaps` (lane assignment). `CHANNEL_LANE` (reservation width per crossing edge) is tuned;
the lane optimiser is a greedy heuristic, so its crossing/overlap counts are mildly non-monotonic in that
constant — re-measure if you retune. Possible next: size reservation by the MAX simultaneous overlap in a
channel rather than the total crossing count (less over-reservation on wide, sparse channels); extend band
detection below the top level for diagrams whose stacks live inside a single group.

## Bus rendering shipped as an MVP (opt-in)
"Bus" mode = `respreadPorts(scene, true)` (no crossing-min / no separation, so shared-endpoint connectors
stay on a common backbone) + renderer junction dots. It's display-only (a re-route + dots, no re-layout),
gated to the box-routed families. The backbones currently come only from the staggered port routing, so
sharing is modest. Next, to make buses pronounced: ACTIVELY merge shared-endpoint edges through a common
trunk (route them to one shared port / backbone, branch with junctions) — the yWorks BusRouter model in
[[edge-routing-sota]]. Also consider snapping near-parallel close segments onto a single track.

## Trunk merging shipped (the aggressive bus, opt-in "Trunk" toggle)
`trunkRoutes` = spread the non-fan edges, then merge each ≥3 fan onto a shared trunk + single port. The
trunk currently hugs the node (short trunk, long parallel approaches) and does NOT run obstacle avoidance,
so a trunk leg can clip an intervening box on dense diagrams. Next: place the trunk in the channel between
the fan and its far ends (balanced), and maze-route the trunk's approaches around obstacles; consider a
min-fan of 2 behind a threshold. Junction detection is shared with Bus mode (renderer `busJunctions`).
