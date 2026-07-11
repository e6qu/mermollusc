# @m/layout — do next

## Routing quality (from the 2026-07-11 live-demo review — user-specified constraints)

These came out of a precise routing audit of the deployed demo; each is its own follow-up PR (routing
is the riskiest area — verify with the `edge-border-clearance` scorecard + before/after screenshots).

- **Incompatible edges can still share a backbone — TRUNK closed, BUS ~0.5% dense residual.**
  Progress: #294 fixed the per-node trunk FAN; `offsetParallelEdges` spreads same-pair multi-edges
  (straight + bent); and `separateIncompatibleBackbones` (2026-07-12) closes the cross-node cases —
  collinear stacked nodes and mixed fans at a shared mount — by moving one conflicting segment onto clear
  track, sliding a carried mount along the node side (the cardinal-mount invariant was relaxed to
  "on the side" for exactly this). TRUNK is now a REAL gate in `trunk-fuzz.prop.test.ts`.
  - **BUS dense residual (~0.5%, KNOWN BUG, `it.fails`).** In dense graphs (8 nodes / ~14 edges) no local
    single-segment move converges — clearing one axis lengthens a neighbour leg into a conflict on the
    other. The remaining fix is NODE-MOVING relayout (nudge a node so the fan/stack stops aligning), not a
    post-hoc route edit. Drive it with the fuzzer; drop bus `.fails` when clean.
  - **Latent: trunk multi-edge ports go off-side in dense fuzz.** `cardinalMountViolations` (relaxed) still
    flags some trunk+multi-edge scenes where `trunkMerge` places a shared port off the node side (not just
    off-centre). Catalog examples are clean; this is fuzz-only. Fix `trunkMerge` to keep ports on the side.
- **Bus routing spacing.** *(partly done 2026-07-11)* Bus mode now uses a wider lane separation
  (`BUS_LANE_GAP` 22 vs 14) and a deeper first stub (`BUS_CHANNEL_GAP` 20 vs 10), so a node's fan of
  connectors separates more and leaves the node farther before turning. STILL OPEN and needs a bigger
  routing pass: (a) backbones/legs still pass ~10px from *unrelated* node/group borders (measured) —
  the direct-route common case checks only crossings, not pass-by proximity, so raising clearance means
  making the router keep segments off borders it merely runs alongside (shared with the general sweep
  below and the `edge-border-clearance` guard's threshold, so it touches every family); (b) in dense bus
  diagrams the edge labels overlap nodes/each other ("SQL" on a node, "RPC"/"HTTP" overlapping) — the
  decollision pass needs to handle bus-mode label positions.
- **General routing-quality sweep.** Across families, hunt and fix: edges overlapping where they needn't,
  edges running alongside a node/container border (reads as ambiguous "is it attached?"), and confusing
  near-parallel runs. Extend the geometric guards (border clearance, label-vs-node) with an
  edge-runs-alongside-border check.

## Other

- **Renderer support for richer caption styles.** Two Mermaid-parity items now emit plain captions and
  would look closer to Mermaid with a styled variant: gitGraph `tag:` labels (Mermaid draws a small
  BORDERED tag plate; we emit a plateless caption) and diagram titles (Mermaid uses a larger/bolder
  title face; ours renders at the node-label size). Both need a renderer-side caption style (e.g. a
  `style: "plain" | "tag" | "title"` on the caption decoration) — layout already positions them.

- **Squeeze the last box-family crossings/hugs.** `rerouteBoxEdges` maze-routes cross-group edges that
  cross a node or hug a border to a cleaner mount pair, cutting the four-family total from 22 to 18.
  The badness-ranked candidate pool (maze + L/Z patterns + entered-group walls) has since retired the
  worst class — sliding entries along a target's own border and back-side group tunnelling (cloud
  `alb→web`, block `lb→web1`). Remaining gains need denser routing channels (layout spacing) or
  per-edge port selection; the `edge-border-clearance` e2e's total is the scorecard.

- **Mount re-selection to kill the last border-hugs.** `separateEdgesFromBorders` clears interior
  channel legs, but a 3-point L-edge whose first/last (mount-anchored) segment sits exactly on an
  adjacent box's border can't be shifted without moving the mount (network `fw→rtr`; block `lb→web1`
  is fixed by the facing-side reroute above). Needs per-edge mount/port selection (choose a side whose
  approach doesn't run along a neighbour's border) — the same redesign as per-edge ports.

- **Span-wide block boxes funnel every edge through one side-centre mount.** Cardinal mounts are the
  side CENTRES only, so a full-width block row (`lb:4`) forces all its edges through a single point —
  the crossing optimiser then legitimately prefers wrap-around routes that read as broken. Real fix is
  multiple mount slots per (long) side — the same redesign the block column-spans item and the
  "per-edge port choice" item already point at; do them together.

- **Mermaid parity gap in "classic": the engine.** Edge-geometry parity is done (the renderer draws
  classic layered-family edges as splines); the remaining measurable difference from real Mermaid is
  ELK layered vs Mermaid's default dagre — different rank/order heuristics produce visibly different
  node orderings on some graphs. Either adopt dagre-like settings or document classic as
  "Mermaid-like, ELK-routed".
- **Wire `make cov` into a gate.** The coverage ratchet had drifted ~6 points above actual on main with
  nobody noticing, because neither pre-commit nor pre-push runs `make cov`. Re-based 2026-07-02; decide
  where the gate runs so a ratchet miss actually fails something.
- Refine regenerate to re-layout only *unpinned* nodes (ELK can't cleanly fix a subset; needs a
  per-node fixed-position approach or post-pass).
- *(done)* Add a broader route invariant sweep that checks every routed graph family for cardinal
  endpoint mounts after each layout style, including bus/trunk. Manual-drag rerenders remain covered
  by the app's focused Playwright mount-point and edge-label movement specs.
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

## Edge-routing (LAYOUT_RESEARCH steps 1–3: DONE)
Deterministic port assignment (`spreadPorts`) shipped for all four box-routed families (cloud, block,
c4, network — verified: all call it), ELK edge spacing tuned, and obstacle avoidance shipped as the maze
router (`mazeRoute`/`mazeAroundObstacles`).
- *(done)* Prevent massive outer-edge detours around dense diagrams (like Cloud) by separating crossings and overlaps in the routing cost function (`CROSSING_COST = 10`, `OVERLAP_COST = 150`), favoring short direct paths with minor crossings over huge empty loops while strictly preventing parallel lines from overlapping.


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

## Architecture starter layout polish shipped
Network now places ungrouped ingress nodes ahead of grouped zones, and cloud wraps top-level boxes at a
narrower row budget with larger inter-row channels.

## Container-title routing guard shipped
Edges now avoid the visible title-label area of containers they enter, and `styleOk` enforces that guard.

## Cross-boundary child port selection shipped
Routes that cross a group boundary now choose their side from the containing group but still anchor on the
actual child box. Remaining visual debt: choose shorter channel positions for long cross-tier connectors,
so cloud ingress links do not reserve more horizontal distance than necessary.

## Side-centre mount cleanup shipped
ELK/compartment box diagrams now normalize edge endpoints to side-centre mount points after layout.
Possible next: expose per-edge or per-family port preferences if users need a specific side instead of
nearest-side selection.

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

## Trunk merging shipped (the aggressive bus, opt-in "Trunk" toggle, now enhanced)
`trunkRoutes` = spread the non-fan edges, then merge each ≥2 fan onto a shared trunk + single port. Enhanced to place the trunk line dynamically in the center of the available routing channel (balanced) and to maze-route each edge's approach to the trunk around obstacles (avoiding clipping). Defaulted playground UI toggle to true on first load.

## First-class architecture cleanup shipped

- *(done)* Network default icons now use bundled vendor packs instead of authored `arch` placeholders;
  cloud defaults already use vendored marks.
- *(done)* State diagram layout honors source `direction`.
- *(done)* Label width measurement treats literal `\n` as a rendered line break.
Network roots now read left-to-right as zones, cloud rows have room for tiered routing demos, and
timeline event connectors are real edges so dragged events keep visible links. Remaining visual debt:
route-label placement on dense cloud trunks can still improve without removing source labels.
