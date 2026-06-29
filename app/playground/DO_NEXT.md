# @m/app (playground) — do next

Open, actionable items only. Completed work is logged in `WHAT_WE_DID.md`; known defects are in
`BUGS.md`. Cross-module collab work lives in `modules/collab/DO_NEXT.md`.

## Sweep-round audit backlog (deferred from the multi-agent review)
- **Node colour/fill restyle (J4).** Only shape + arrow-kind cycling exist; colour is the most-expected
  styling control. Add a swatch writing a `style`/`classDef` patch (flowchart first), or mark as source-only.
- **(done) Connect/Duplicate discoverability (J5).** Their multi-select requirement is hidden (button vanishes)
  rather than shown disabled-with-tooltip; navigator has no Duplicate key. Prefer disabled-with-reason.
- **Share-link overwrite (J8) + icon-pack discoverability (J9).** Smaller, independent polish items.
- **(done) Self-relations (P5, layout).** c4/network render a self-link as a degenerate dot; cloud silently
  drops it. Pick one policy (small loop, or parser-level rejection) and apply uniformly.


## Editing breadth
- **Edge rename + restyle for the remaining families.** Flowchart + block now support adding a label to
  a bare edge and cycling the arrow style (`-->`/`---`/`-.->`/`==>`). **Sequence** is the other purely
  presentational family (message kinds `->>`/`-->>`/`->`/`-->`) — extend restyle there with its own
  arrow-span capture + token map. The **semantic-arrow** families (er crow's-foot, class UML relation,
  state/c4/requirement/gitGraph) intentionally do NOT get a free restyle — their operator encodes
  meaning; they want a typed cardinality/relation picker instead (a separate feature).

- **gitGraph node delete.** Today it's honestly gated ("can't delete this from the canvas"). Implement a
  real commit-span / branch-lane delete in `@m/builder`, then flip the affordance on. Optionally make the
  navigator visually distinguish inert vs. actionable gitGraph/timeline items.
- **DOT as an editable family.** DOT imports load read-only (Add/Connect/Shape gated on `isDotImport`).
  Add `parseDotWithSource` so edits patch the `digraph{…}` body directly instead of injecting flowchart
  syntax; then ungate the affordances for DOT.
- **Sequence notes (makes a dead branch live).** The sequence parser has no `note` token, so
  `deleteActor`'s `SEQ_NOTE` branch is unreachable (see `modules/builder/BUGS.md`). Add note support
  across parser → layout → renderer to make it real — then the sequence example can show a `note over`.
- **Class diagram, parser-led.** Stereotypes (`<<interface>>`), per-end multiplicity labels, generics.

## Connectors (scoped next phase — sequenced)
The renderer already supports curved edges (bezier) and `labelPos`. Build in this order:
1. **Per-edge style from the editor/canvas:** let an edge be straight / orthogonal / curved, chosen
   per-edge. Curve/route is a render/overlay property (flowchart syntax has no curve token), so store
   the per-edge preference in the overlay (like positions) and offer it on the edge "Style" control.
2. **Junction dots + crossing cues (renderer):** a discreet dot where edges merge (with the arrowhead
   at the dot if the edge is directed); a discreet hop/gap where two non-joining edges cross. Both are
   display-list/paint additions over the existing routed waypoints.
3. **Smart auto-routing (largest, approximate):** obstacle-avoiding routing with a few re-route options.
   Research-grade; deliver as a best-effort pass, not exact.

## Layout / rendering
- **c4 + network edge labels overlap node labels on busy diagrams.** Both use a simple absolute layout
  with a fixed ~24px inter-node gap, so a wide edge label on a short segment bleeds into neighbouring
  boxes (worked around in the menu examples with short labels). Reserve horizontal room for edge labels,
  or route relations around the boxes.
- **`routeWaypoints` fallback wording.** The straight-line fallback for <2-point ELK sections contradicts
  layout's "no positional fallback" contract — return a `LayoutError` or carve out the wording.
- **Renderer-backend selection.** `htmlInCanvasSupported` is exported but unused — wire HTML-in-Canvas
  detection to an actual backend choice, or drop the dead export.
- **Incremental edge-marker rebuild (perf).** Recompute display-list commands only for edges whose
  endpoints are in the override delta. Home the helper in the renderer core and justify it with a real
  perf trace first — not structural evidence.

## Accessibility / UX
- **(done) Mobile / touch (partly done).** The palette + context bar are now reachable and 44px touch-sized at
  phone width, the export cluster is behind an "Export ▾" menu, and the source panel collapses to free
  the canvas. Still wanted, ideally with real-device testing: gesture handling (pinch-zoom vs. pan), a
  bottom-sheet for the editing verbs on very small screens, and a verification pass on physical devices.
- **Surface "why-disabled" reasons.** Connect/Add/Relax disabled-reasons live on hover titles + the
  capability record; also surface them in the always-visible task status for touch/keyboard.
- **Keyboard resize.** The task hint promises corner handles a keyboard user can't operate — add a
  resize-by-key affordance or scope the hint.
- **Unify the confirmation channel.** `flashStatus` confirmations (add/duplicate/connect/shape) don't
  nudge the task HUD the way the `setStatusAndAnnounce` ones do.
- **Minimap arrow-pan has no spoken feedback** (LOW — the navigator is the primary SR surface).

## Collaboration (Phase 2/3 remainder — see `modules/collab/DO_NEXT.md`)
- **Production store + browser login.** Postgres/S3 durable store and the browser Auth0 login flow are
  the Phase 2 remainder.
- **WS auth hardening (before auth ships).** Move the `?token=` out of the query string into the first
  frame after open; add a `connect-src` CSP.

## Security (LOW — not exploitable today)
- **Icon-pack SVG sanitiser** misses external-subresource refs (`<image href="http…">`, `<use>`) and SMIL
  `set`. Not exploitable today (pack markup is only embedded via `<image href="data:…">`, where image
  mode disables scripting/fetch). Tighten to an element/attribute allowlist if it's ever inlined.

## Code hygiene
- **Move `arrangeDeltas`** align/distribute math from `main.ts` into `@m/builder` core (boundary hygiene).

## Test-coverage gaps (behaviour is real; the assertion is the gap)
- **CAN-01a** — assert the edge route-highlight / label-anchor draw call (today only shot-reviewed via
  `02-edge-selected`).
- **CAN-08** — end-to-end assert that Regenerate clears an imported *unpinned* override (today only the
  `pinnedOverrides` filter + the preserves-pinned assertion; the clears-unpinned path needs an imported
  overlay, since drag/resize always pin).
- **`e2e/network-icons.spec.ts`** asserts only `errors == []`; assert painted pixels / registry
  resolution (its `network-icon-override` sibling now asserts the loud-failure half).
- *(optional)* a visual pixel golden off `make shots` — the display-list goldens already guard geometry
  without font/AA flakiness, so this is only for catching paint regressions.

## Startup weight
- Icon and ELK layout chunks are large. Do a real lazy-load / size-budget pass — not warning suppression.
