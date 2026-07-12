# @m/app (playground) — do next

Open, actionable items only. Completed work is logged in `WHAT_WE_DID.md`; known defects are in
`BUGS.md`. Cross-module collab work lives in `modules/collab/DO_NEXT.md`.

## Deferred from the 2026-07-02 UX audit (real findings, not fixed in that pass)
- *(done)* **Structured logging (§8 contract).** All app boundary logging routes through
  `src/log.ts`'s `appLog` with the closed `AppEvent` union; `LogRecord` gained the `data` field §8 had
  always promised.
- **Bare-edge labelling is flowchart/block-only.** Double-click labelling of an unlabelled edge
  (`wrapBareEdge`) should extend to network/cloud links (grammar supports `: "label"`) and state
  transitions — the graph-wide-scope rule applies; today those families answer "this item has no
  editable label".
- *(done, 2026-07-11)* **Collab join flash.** Collab boot now paints nothing under a "joining the
  shared room" status until the first `Y.Text` sync (which renders + fits), so a joiner never sees the
  local/sample diagram first.
- *(done)* **Room-invite affordance** — in a collab session, Share copies the room link itself.
- **Gantt keyboard parity.** Bar reschedule/duration are mouse-only (`keyboardResizeSelection` excludes
  gantt); add Alt+Arrow day-shift/duration keys. Gantt `after` dependencies also have no canvas
  Connect even though the grammar expresses them.
- *(done, 2026-07-11)* **Alt+Arrow semantics differ by focus** (resize on canvas, move in the
  navigator) — the help dialog now carries the note in both its Edit and keyboard-only sections.

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
- *(done 2026-07-11)* **Sequence label overlap for tight request→reply pairs.** A message and its
  immediate opposite-direction reply (e.g. "authorize payment" / "auth code") sat on adjacent rows and
  both labels lifted toward the gap between them, overlapping. Root-caused by measuring the drawn label
  positions (pairs were ~12px apart vs ~28px for same-direction messages). Fixed by widening the
  sequence message row spacing (`MESSAGE_GAP` 40 → 56 in `@m/layout`'s `sequence.ts`) so even the
  tightest pair clears — matching Mermaid's roomier row height. Guarded by a `golden.test.ts` assertion
  (a request + reply's 16px label boxes stay vertically clear).
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
- *(done, 2026-07-11)* **c4 + network edge labels bled into node boxes.** `decollideEdgeLabels` now
  treats every node/container box (incl. the edge's own endpoints, and group title bands/border strips)
  as an obstacle with a clearance ring, and clamps labels to the sheet so a long one can't clip off the
  top edge. Applied for every family that runs the pass. Covered by `test/integration/parity.test.ts`
  in `@m/layout` (labels off node boxes + on-sheet + pairwise-separated for network/c4/cloud/state/DOT).
- *(done)* **`routeWaypoints` fallback wording** — the `<2`-point case is documented in
  `modules/layout/PLAN.md` as a defined-geometry boundary contract (a degenerate ELK section still
  yields real, drawable geometry loudly derived from the node centres), not a silent fallback.
- *(resolved: keep)* **`htmlInCanvasSupported`** stays exported though the app doesn't call it yet — it
  is the documented, tested detection seam for the HTML-in-Canvas rich-label backend, which is blocked
  on the API shipping in stable Chromium (see `modules/renderer/DO_NEXT.md`); deleting and re-adding it
  when the API lands would lose nothing but the test coverage it already has.
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
  present, skips only the relay, and persists whole Yjs room snapshots through `@m/collab`'s IndexedDB
  `RoomStore`. The built-artifact Pages suite now runs from root `make e2e-pages` and the pre-push
  gate, and asserts the IndexedDB room snapshot directly.
- **Production store.** Postgres/S3 durable store remains for the auth-on relay path; static
  `MEMBERSHIP_FILE` room roles now cover the first real membership source.
- *(done)* **Browser Auth0 login.** Env-gated Auth0 Authorization Code + PKCE now supplies the relay
  access token and presence identity.
- *(done)* **WS auth hardening (before auth ships).** Tokens now travel in the first WebSocket auth
  frame after open, and the app carries a `connect-src` CSP.
- *(done, 2026-07-11)* **Relay style sync in collab rooms.** Node colour accents + edge route styles
  now sync through the shared Yjs overlay instead of being session-local (peers see restyles).

## Security (addressed 2026-07-11 in review-omnibus)
- *(done)* **Icon-pack SVG sanitiser** — replaced the regex denylist with a parse-based element/attribute
  allowlist in `@m/icons` (`load.ts`): remote `<image href>`, external `<use>`, and SMIL animation
  elements are now rejected loudly through the decode boundary; every bundled glyph is swept through it.
- *(done)* **CSP `connect-src`** — narrowed and build-generated (`vite.config.ts`): no blanket `https:`,
  Auth0 origin only when configured, no `wss:` in the backend-free demo.
- *(done)* **Relay cross-origin WS upgrades** — `modules/relay` now enforces an Origin policy
  (loopback/same-host + `ALLOWED_ORIGINS`) before the upgrade, so an auth-off local relay can't be
  driven by an arbitrary visited page. JWT verification is also alg-pinned to RS256.

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
