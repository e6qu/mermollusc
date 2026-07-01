# @m/app (playground) — do next

Open, actionable items only. Completed work is logged in `WHAT_WE_DID.md`; known defects are in
`BUGS.md`. Cross-module collab work lives in `modules/collab/DO_NEXT.md`.

## Sweep-round audit backlog (deferred from the multi-agent review)
- *(done)* Add a screenshot review pass specifically for selected-node mount handles across light/dark,
  because the geometric regression guard does not catch theme visibility.
- *(done)* **Node colour/fill restyle (J4).** Node colour accents live in the overlay sidecar, are exposed
  as keyboard-operable context swatches, persist locally, and travel through share links.
- **(done) Connect/Duplicate discoverability (J5).** Their multi-select requirement is hidden (button vanishes)
  rather than shown disabled-with-tooltip; navigator has no Duplicate key. Prefer disabled-with-reason.
- *(done)* **Share-link overwrite (J8) + icon-pack discoverability (J9).** Share no longer mutates the
  page hash on clipboard success, and the icon picker exposes the custom pack loader.
- **(done) Self-relations (P5, layout).** c4/network render a self-link as a degenerate dot; cloud silently
  drops it. Pick one policy (small loop, or parser-level rejection) and apply uniformly.


## Editing breadth
- *(done)* **Edge rename + restyle for the presentational families.** Flowchart + block support adding a
  label to a bare edge and cycling arrow style; sequence message arrows cycle through their four
  presentational kinds with e2e coverage. The semantic-arrow families (ER crow's-foot, class UML
  relation, state/C4/requirement/gitGraph) intentionally do NOT get a free restyle — their operator
  encodes meaning and wants a typed cardinality/relation picker instead.


- **(done) DOT as an editable family.** DOT imports load read-only (Add/Connect/Shape gated on `isDotImport`).
  Add `parseDotWithSource` so edits patch the `digraph{…}` body directly instead of injecting flowchart
  syntax; then ungate the affordances for DOT.
- **(done) Sequence notes (makes a dead branch live).** The sequence parser has no `note` token, so
  `deleteActor`'s `SEQ_NOTE` branch is unreachable (see `modules/builder/BUGS.md`). Add note support
  across parser → layout → renderer to make it real — then the sequence example can show a `note over`.
- *(done)* **Class diagram, parser-led.** Stereotypes (`<<interface>>`), per-end multiplicity labels, generics.

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
- **Examples parity guard:** Done for parse → layout → display-list → SVG across every catalog entry,
  with explicit network/cloud catalog assertions and cardinal endpoint mount checks across the routed
  families plus bus/trunk architecture variants. Network/cloud starters are now curated for public demo
  readability; future source changes should be checked with before/after screenshots, not only
  parser/layout tests.
- *(done)* Edge labels are draggable on the canvas, persist their relative route position, move with
  rerenders, and render literal `\n` as multiline labels.
- *(done)* State examples can use `direction`, and the state family honors it end to end.
- *(done)* Public cloud/network starters and network defaults use bundled vendor icons where available;
  original BPMN glyphs remain unchanged.
- **Container-title visual guard:** Done for every catalog entry via `edgesAvoidContainerHeaders`; future
  demo examples fail integration if a connector cuts through a container title label.
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
- *(done)* **Surface "why-disabled" reasons.** Connect/Add/Relax disabled-reasons live on hover titles + the
  capability record; also surface them in the always-visible task status for touch/keyboard.
- *(done)* **Keyboard resize.** The task hint promises corner handles a keyboard user can't operate — add a
  resize-by-key affordance or scope the hint.
- *(done)* **Unify the confirmation channel.** `flashStatus` confirmations now refresh the task HUD
  without replacing the diagram aria label or stale/error state.
- *(done)* **Minimap arrow-pan spoken feedback.** Keyboard minimap panning now reports arrow and
  Home/End movement through the shared live region.

## Collaboration (Phase 2/3 remainder — see `modules/collab/DO_NEXT.md`)
- **Backend-free persistence parity:** Pages now runs the real local Yjs document when `?collab` is
  present, skips only the relay, and persists whole Yjs room snapshots through `@m/collab`'s browser
  `RoomStore`. The built-artifact Pages suite now runs from root `make e2e-pages` and the pre-push
  gate. Next architectural step is evaluating an embedded browser store (SQLite/WASM or equivalent)
  behind that same snapshot seam, chosen with the repo's pinned-version process and verified against
  the production store contract.
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
- *(done)* **CAN-01a** — assert the edge route-highlight / label-anchor draw call. The Playwright test
  selects a labelled edge and samples the canvas pixel at the painted anchor handle.
- *(done)* **CAN-08** — end-to-end assert that Regenerate clears an imported *unpinned* override (today only the
  `pinnedOverrides` filter + the preserves-pinned assertion; the clears-unpinned path needs an imported
  overlay, since drag/resize always pin).
- *(done)* **`e2e/network-icons.spec.ts`** asserts only `errors == []`; assert painted pixels / registry
  resolution (its `network-icon-override` sibling now asserts the loud-failure half).
- *(optional)* a visual pixel golden off `make shots` — the display-list goldens already guard geometry
  without font/AA flakiness, so this is only for catching paint regressions.

## Startup weight
- Icon and ELK layout chunks are large. Do a real lazy-load / size-budget pass — not warning suppression.

## Demo visual follow-up
- Dense cloud route labels can still be improved by the layout/renderer instead of removing labels from
  examples. The current catalog is visually cleaner and gated by parse→layout→display→SVG tests, but a
  route-label placement pass for trunk paths would make future complex cloud diagrams more robust.
- Side-centre mount snapping is now family-gated to ELK/compartment box diagrams. Next visual step, if
  needed: add user-visible per-edge port choice for those diagrams rather than relying only on
  nearest-side selection.
- UI e2e now owns free per-run local app and relay ports during the gate. Keep this aligned with the
  shot harness so visual and gating runs cannot attach to unrelated local apps.
- *(done)* Root pre-push now runs the backend-free Pages demo e2e through `make e2e-pages`, so the
  built `/demo/?collab` artifact is checked before pushes.
- *(done)* Pages backend-free e2e now owns its static artifact server and verifies built `/demo/?collab`
  does not open a relay WebSocket while preserving the local Yjs room snapshot across reload.
