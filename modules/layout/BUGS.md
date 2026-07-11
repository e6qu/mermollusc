# @m/layout — bugs

_None known._

## Resolved

- ~~**Flowchart Relax could leave diamond connectors attached to arbitrary side points.**~~ Fixed —
  the final mount snap now applies through the display path and no longer exempts curved edges; spread
  routing keeps lane separation outside the node instead of moving endpoints away from cardinal mounts.
  The exported `cardinalMountViolations` invariant now checks the same endpoint contract across routed
  catalog families and bus/trunk display routes.

- ~~**Edge routing chose extremely long detours around the diagram outside.**~~ Fixed — the candidate cost
  sorting in `minimizeCrossings` strictly prioritized crossings over length (lexicographical), forcing massive
  detours to avoid minor channel crossings. We resolved this by separating crossings and overlaps in cost evaluation
  (`CROSSING_COST = 10` for perpendicular crossings, `OVERLAP_COST = 150` for parallel overlaps) and optimizing
  greedy and ILS search passes for the unified `ConflictCost + Length` score. This prefers short paths with minor
  crossings over huge empty detours while strictly avoiding parallel overlaps. Adjusted unit test coordinates.


- ~~**Edge labels overlapped nodes in the absolute-layout families (cloud/c4/network/block).**~~ Fixed —
  these placed edge labels at the routed midpoint (opaque plate) in a tight 24px gap, so a label landed
  on a node ("cloud is bunched up"). Widened `GAP` and, for the orthogonal cloud/block routes, anchored
  the label on the route's central cross-channel (`routeChannelMid`). Skipped-over nodes are avoided now
  too (`decollideEdgeLabels` treats unrelated node/container boundaries as obstacles). The residual
  class re-triaged 2026-07-02 (a label on its OWN edge's endpoint box, e.g. network's "filtered" on its
  Internet endpoint; plus labels clipping the sheet edge, e.g. "SSH" at the top) is resolved 2026-07-11:
  endpoint LEAF boxes are obstacles with a clearance gap, related groups contribute title-band + border
  strips, and every label position is clamped onto the sheet.

- ~~**Block composite children poked over the group border.**~~ Fixed — a composite whose content needs
  more columns than its parent grid offers had its width column-snap-clamped below the content
  (`span ≤ columns`), so the right-most children (demo `web-1`/`api-2` row) sat on/over the border. The
  box width is now floored at the natural content width; that case spans the full row, so nothing sits
  to its right.

- ~~**Connectors tunnelled into groups through non-facing sides / slid along their target's border.**~~
  Fixed — `rerouteBoxEdges` now walls an entered group's non-facing sides for the maze, counts
  border-sliding entries as hugs, and re-ranks maze + L/Z pattern candidates by on-screen badness
  (cloud `alb→web "HTTP"` dove past Services and skimmed web's flank; block `lb→web-1` looped outside
  the group and entered from the left).

- ~~**Stack overflow on a duplicate id nested in its twin.**~~ Fixed (pipeline-fuzz find) — `layoutC4`'s
  `place` and `toElkGraph`'s `container` recurse over an id-keyed children map. A source with two
  `Boundary(x)`/`subgraph X` blocks sharing an id, one nested in the other, made the bucket key back into
  itself and recurse forever (`RangeError: Maximum call stack size exceeded`) — a core-totality
  violation. `layoutC4` now rejects duplicate element ids loudly; `container` carries an on-path visited
  guard. `cloud.layout`'s `place` (the lone remaining unguarded nested-container layout) gained a
  `MAX_NEST_DEPTH` cap matching `network`/`block`. Covered by a deterministic app regression test plus
  the parse→layout→render fuzz that found it.

- ~~**ELK edge route truncated to `sections[0]`.**~~ Fixed (audit sweep, 2026-06-20) — the adapter now
  concatenates all of an edge's `sections`, so a container-crossing edge keeps its full route.

- ~~**gitGraph commit labels overflow the commit dot.**~~ Fixed — a commit is now a rounded **pill
  sized to its id+tag** (not a fixed ~26px dot), so the label always sits inside, and the per-axis
  pitch is sized to fit the pills so neighbours never collide in any orientation. No renderer change
  was needed (the node-sizing moved into `layoutGitGraph`).

Checked while adding the gitGraph lane layout.

Checked while adding the timeline column layout.

Checked while making the pure layouts total-by-Result (no silent positional fallbacks).

Checked while adding the optional C4 element description.

## Resolved

- ~~elkjs ships no type definitions~~ — false: `elkjs@0.11.1` ships `lib/elk-api.d.ts`
  (verified 2026-06-14). We use the bundled entry `elkjs/lib/elk.bundled.js` and still decode the
  layout result with Zod at the shell boundary before it reaches the core.

Checked while routing state diagrams through the ELK layout path.

Checked while routing composite states through flowchart subgraphs.

Checked while routing ER diagrams through the ELK path.
Checked while restoring state Scene roles after flowchart-backed layout.
Checked while placing state notes by side and adding pie donut inner radii.
Checked while adding the empty-graph / self-loop layout robustness suite (no crashes found).
Checked while implementing obstacle-avoidance and dynamic channel-based trunk routing.
Checked while implementing unified layout style dropdown UI and per-family custom styles.
Checked while tightening network/cloud starter readability with ingress-first network ordering and
narrower cloud tier wrapping.
Checked while adding the container-title route invariant and applying header-aware maze rerouting before
ELK tidy candidate selection.
Checked while changing cross-boundary grouped-child side selection to use the containing group for
orientation and the child box for the final port.

Checked while making cloud/network architecture accents first-class, changing network root-zone ordering,
and converting timeline event connectors to real edges.

Checked while family-gating side-centre mount snapping and covering corner-ish endpoint correction.

Checked while switching network defaults to vendored icons, honoring state direction, and sizing escaped
multiline labels.

Checked while adding gantt/pie/timeline titles, gitGraph classic id/tag captions, milestone side
labels, mindmap hexagon sizing, and the label/route decollision hardening (sheet clamp, border
strips, facing-side group entry).
