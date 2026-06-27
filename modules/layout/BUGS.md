# @m/layout — bugs

_None known._

## Resolved

- ~~**Edge routing chose extremely long detours around the diagram outside.**~~ Fixed — the candidate cost
  sorting in `minimizeCrossings` strictly prioritized crossings over length (lexicographical), and the greedy/ILS
  loops only accepted transitions that reduced crossings. This forced massive detours (e.g. `worker --> rds` and
  `jobs --> worker` around the whole canvas) to avoid minor channel crossings. We balanced them globally by
  integrating a crossing cost weight (`CROSSING_COST = 75`) across both greedy sweeps and ILS/perturb kicks,
  ensuring short paths with minor crossings are preferred over huge empty loops. Adjusted unit test coordinates
  to match realistic bounds.

- ~~**Edge labels overlapped nodes in the absolute-layout families (cloud/c4/network/block).**~~ Fixed —
  these placed edge labels at the routed midpoint (opaque plate) in a tight 24px gap, so a label landed
  on a node ("cloud is bunched up"). Widened `GAP` and, for the orthogonal cloud/block routes, anchored
  the label on the route's central cross-channel (`routeChannelMid`). A label on a *skipped-over* node
  still needs real obstacle avoidance (a documented limit, not this class).

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
