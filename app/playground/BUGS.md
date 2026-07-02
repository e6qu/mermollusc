# @m/app (playground) — bugs

Resolved (UX/fail-loud audit pass, 2026-07-02):

- ~~**Space was hijacked from every focused button.**~~ Fixed — the global Space-to-pan shortcut now
  yields when a button has focus, so Space activates it (the standard a11y contract). Covered by
  `e2e/ux-regressions.spec.ts`.
- ~~**Loading an example destroyed the undo history while promising undo.**~~ Fixed — the example swap
  is now one recorded history step (text + overlay together); ⌘Z genuinely restores the previous
  diagram. In a collab room the confirm is always shown and says the swap affects every peer, and the
  `?example=` URL rewrite now merges into the existing query instead of dropping `?collab`/`room`/`ws`.
- ~~**Opening a share link or `?example=` URL permanently overwrote the visitor's saved diagram.**~~
  Fixed — persistence stays disarmed for hash/example-derived source until the visitor makes an edit of
  their own. Covered by `e2e/ux-regressions.spec.ts`.
- ~~**Every programmatic source mutation left a stale text snapshot, corrupting the next typing
  session's undo entry.**~~ Fixed — all programmatic mutations route through one `setSourceValue`
  helper that refreshes the snapshot (a bare `editor.setValue` no longer appears outside it).
- ~~**The overlay similarity wipe cleared the undo history and re-fired during undo/redo.**~~ Fixed —
  the wipe records a history step instead of clearing the stacks, surfaces in the status bar instead of
  only `console.warn`, and is skipped entirely during undo/redo-driven renders.
- ~~**Add node and the navigator's keyboard connect were not undoable.**~~ Fixed — both record history;
  the navigator commits through a `commitSourceEdit` port instead of a bare `editor.setValue`.
- ~~**Action errors dimmed a perfectly valid diagram and rewrote its screen-reader description.**~~
  Fixed — action outcomes (rename/label rejections, icon-pack failures, sign-in failure, share/copy
  confirmations, collab connection changes) route through `flashStatus`, which now carries its own
  level and never touches the canvas aria-label or the stale flag; `setStatus` is reserved for
  parse/layout/render outcomes.
- ~~**Share stayed enabled on a broken source and its success message erased error surfacing.**~~
  Fixed — Share gates on a valid render alongside the export buttons, and share outcomes are transient
  flashes that leave the parse-error record (editor diagnostic, stale dim) alone.
- ~~**Export buttons permanently lost their tooltips after first enable.**~~ Fixed — the authored
  titles are restored, not erased, when re-enabling.
- ~~**Boot-time collab notices were clobbered by the initial render's summary status.**~~ Fixed — the
  "sign in to connect", backend-free-relay, unknown-`?example=`, and rejected-`?ws=` notices sequence
  after the initial render completes.
- ~~**Dark-theme flash on load.**~~ Fixed — a tiny render-blocking `public/theme-boot.js` sets
  `data-theme` before first paint (CSP-compatible: an external classic script, not inline).
- ~~**Sequence message restyle was reachable by keyboard but hidden from the context bar.**~~ Fixed —
  `canStyleEdge` includes sequence, matching what `cycleEdgeStyle` implements; `S` on an unsupported
  family's edge now explains itself instead of silently no-op'ing (as does Alt+Arrow resize with no
  resizable node, and a viewer picking an Example).

Resolved (mount-point and label pass, 2026-06-30):

- ~~**Auth-enabled collab still had no browser login or identity-backed presence.**~~ Fixed — the app
  now has an env-gated Auth0 PKCE flow, sends the resulting access token as the first auth frame, and
  labels presence from token claims.
- ~~**Relay auth tokens were encoded into WebSocket URLs.**~~ Fixed — the app passes Auth0 access tokens
  through `connectTransport` as the first auth frame, and the app shell includes a `connect-src` CSP.
- ~~**Backend-free Pages collab e2e was not part of the root gate.**~~ Fixed — root `make e2e-pages`
  now delegates to the app's built-artifact Pages suite, and the pre-push hook runs it alongside the
  live UI e2e checks.
- ~~**Backend-free Pages rooms used Web Storage instead of an embedded browser database.**~~ Fixed —
  `/demo/?collab` now loads and saves whole Yjs room snapshots through `@m/collab`'s async IndexedDB
  room store, and the Pages e2e asserts that database record.
- ~~**App integration stress/fuzz tests used wall-clock budgets as hang guards.**~~ Fixed — the tests
  now use explicit longer timeouts, preserving the fail-loud hang guard without making busy local hook
  runs fail as performance tests.
- ~~**UI e2e pre-push could fail when port 4173 was busy.**~~ Fixed — the UI e2e runner reserves free
  app and relay ports for each run, and collab specs pass the chosen relay through `?ws=`.
- ~~**Backend-free Pages collab had only manual built-artifact probes.**~~ Fixed — the Pages e2e target
  now builds `site-dist/demo/`, serves it, asserts `/demo/?collab` opens no WebSocket, and proves the
  local Yjs room snapshot survives reload.
- ~~**Pages `?collab` faked a disabled backend instead of using the browser-capable runtime.**~~ Fixed —
  the backend-free build now constructs the same `@m/collab` Yjs document/source binding as production
  and omits only the relay transport, so Pages remains local-only without turning off real client code.
- ~~**Pages local collab still persisted through app-only source/overlay paths.**~~ Fixed — backend-free
  local collab now saves and hydrates whole Yjs room snapshots via `@m/collab`'s browser `RoomStore`,
  while URL share/example loads stay authoritative over stored rooms.
- ~~**Sequence message restyle lacked demo-level proof.**~~ Fixed — selecting a sequence message and
  pressing `S` now has Playwright coverage for cycling `->>` → `-->>` → `->` → `-->`.
- ~~**Node colour/fill restyle needed first-class coverage.**~~ Fixed — colour accents already live in
  the overlay sidecar; the context swatches are now named radio controls with keyboard movement, and
  Playwright covers persistence, share-link roundtrip, and clearing.
- ~~**Share overwrote the current demo URL on normal copy.**~~ Fixed — successful clipboard sharing now
  leaves the page hash alone; fallback and oversized-link paths still expose the URL in the address bar.
- ~~**Custom icon packs were hidden in export overflow.**~~ Fixed — the icon picker drawer now exposes
  the same icon-pack JSON loader as the overflow menu.
- ~~**Minimap arrow-pan had no spoken feedback.**~~ Fixed — keyboard panning through the minimap now
  announces arrow moves and Home/End jumps through the shared live region, covered by Playwright.
- ~~**Transient confirmations bypassed task guidance.**~~ Fixed — `flashStatus` now refreshes the
  always-visible task guidance while preserving the canvas diagram label and parse stale/error state;
  Playwright covers the Relax confirmation path.
- ~~**Resizable-node guidance promised a mouse-only affordance.**~~ Fixed — a selected resizable node can
  now be resized with `Alt+Arrow`, the demo help/footer expose the shortcut, and Playwright covers undo.
- ~~**Disabled editing actions required hover to explain why.**~~ Fixed — Add/Relax/Connect/Duplicate
  reasons now appear in the always-visible task guidance and are covered by Playwright.
- ~~**Mount-point handles had only geometric coverage.**~~ Fixed — the screenshot harness now captures a
  selected node in both light and dark themes, so theme contrast regressions are reviewable from
  generated demo shots.
- ~~**Relax could display flowchart diamond edges attached to arbitrary side points.**~~ Fixed — Relax
  now feeds the laid-out scene through cardinal mount snapping, and the displayed no-style path also
  honors mount snapping. The Examples integration test now hard-fails off-mount endpoints across the
  routed catalog and bus/trunk architecture display variants.
- ~~**Selected nodes did not reveal their connection mounts.**~~ Fixed — the canvas selection overlay now
  draws the four cardinal mount points for selected nodes.
- ~~**Selected-edge route handles were only screenshot-reviewed.**~~ Fixed — the e2e suite now selects a
  labelled edge and samples the canvas pixel at the painted label-anchor handle.
- ~~**Edge-label drag support was not proven across graph families.**~~ Fixed — the e2e suite now drags
  labelled edges through the UI across every graph family that emits edge labels.
- ~~**Regenerate clearing imported unpinned overrides was not proven end to end.**~~ Fixed — the toolbar
  e2e imports a hash/share overlay with an unpinned node position and asserts Regenerate removes it.
- ~~**Network default icons had no painted-pixel assertion.**~~ Fixed — the network icon e2e now samples
  the canvas icon box for every default network kind and fails if the glyph is not visibly painted.

Resolved (multi-dimension audit omnibus, 2026-06-23):

- ~~**Any keystroke wiped all manual canvas layout (unrecoverable).**~~ Fixed — single-user text edits
  ran `clearOverrides()` + `clearHistory()` every render, so editing one node's label discarded every
  dragged/resized position and the overlay undo stack. `renderFromText` now prunes only the
  overrides/groups whose node ids the edit actually removed (after a successful layout) and records the
  prune for undo; collab is unchanged (the room owns the overlay). Covered by `audit-omnibus.spec`.
- ~~**Generic toolbar affordances corrupted families that couldn't parse them.**~~ Fixed — Connect
  injected the flowchart `-->` arrow into gitGraph/timeline/mindmap/pie and the icon picker inserted
  `icon "…"` on flowchart/C4, greying the working diagram. A per-family capability record
  (`familyAffordances`) now disables Connect/Icons with a per-family reason where the grammar rejects
  them, and `appendEdge`/`insertIconRef` no-op there as defence-in-depth.
- ~~**A relabel/edge-label containing a closing delimiter wrote un-parseable source.**~~ Fixed — commits
  validate via `@m/builder`'s `validateLabel`/`relabelNode` against the span's opening delimiter
  (`]`/`)`/`}`/`|`/`"`/newline) and reject loudly (status + announce) instead of corrupting.
- ~~**Share links dropped the entire manual overlay.**~~ Fixed — `#share-link` now encodes
  `&overlay=<serializeOverlay>` (single-user) so a recipient sees the same arrangement the image
  exports already reproduce; the hash is parsed per-`&`-segment so a literal `+` in the source survives.
- ~~**The CodeMirror editor was an unnamed textbox to screen readers.**~~ Fixed — it carries
  `aria-label="Diagram source"`; the control-accessible-name e2e guard now also scans the editor and
  form inputs (naming by label/title, never a field's own value).
- ~~**Shortcut hints showed Mac-only glyphs to every platform, and additive-click was Mac-only.**~~
  Fixed — `[data-mod]` chips swap `⌘/⌥/⇧` to Ctrl/Alt/Shift off Apple, and additive-click accepts Ctrl.

Resolved (collab-era audit sweep):

- ~~**The sequence Examples menu entry failed to parse.**~~ Fixed — the sample used
  `participant W as Web App`, but the current sequence grammar accepts one identifier after `as`.
  The starter now uses `WebApp`, and `test/integration/examples.test.ts` parses every Examples menu
  entry so future catalog drift fails the app test suite.
- ~~**The reshape e2e used stale canvas coordinates after a layout-changing keyboard command.**~~ Fixed
  — after the first `S` reshape, the spec now relies on the app's restored keyboard selection and
  presses `S` again instead of re-clicking an old pixel location. This keeps the test aligned with the
  keyboard UX and avoids false failures after shell/layout redesigns.
- ~~**Visual review could include stale screenshots from old flows or unrelated e2e captures.**~~ Fixed
  — `make shots` now clears generated PNGs before running the shot harness, so design review starts
  from the current named journey set instead of mixing old artifacts with fresh ones.
- ~~**The phone-width first viewport over-prioritized brand/export chrome over the workspace.**~~ Fixed
  — mobile header/control density is tighter and the source plus output panels are both visible in the
  initial phone-width review shot.
- ~~**Shortcut help wrapped awkwardly in the keyboard-only section.**~~ Fixed — the desktop help panel
  is wider with more grid spacing, and `make shots` now includes the help-modal journey.
- ~~**`make shots` could attach to an unrelated local preview server.**~~ Fixed — the shot project now
  owns a dedicated strict port instead of reusing an existing server, so mid-suite server exits fail
  deterministically instead of producing partial artifacts.
- ~~**Live selection survived source replacement.**~~ Fixed — successful renders reconcile selected
  nodes/edges and click order against the new scene before commands run, so Group/Connect/Arrange
  cannot act on dead ids.
- ~~**Export/copy could publish the previous good diagram after the current source failed.**~~ Fixed —
  PNG/PDF/SVG/DOT export and image copy are blocked while the current source is stale and keep the
  status in an error state.
- ~~**Arrange pinned already-aligned nodes.**~~ Fixed — zero-delta arrange actions no longer record
  undo history or write overrides.
- ~~**The minimap was pointer-only.**~~ Fixed — it is focusable, named, and supports keyboard panning.
- ~~**Malformed shared/persisted source could show only a blank stage on first load.**~~ Fixed — when
  no prior scene exists, parse/layout failure shows an in-stage recovery state.
- ~~**The icon picker read as an accidental layout collision.**~~ Fixed — it now opens with a backdrop
  and closes from that backdrop as well as Escape/close.
- ~~**Selected edges had no visible canvas affordance.**~~ Fixed — edge selection now draws a route
  halo plus a label-anchor marker, and the task HUD names edge relabel/delete actions.
- ~~**Selection rings and resize handles scaled with zoom.**~~ Fixed — interaction overlays compensate
  for `viewScale`, so selection strokes, marquee/connect dashes, and corner handles stay usable when
  zoomed in or out.
- ~~**The minimap could stay hidden/stale after resizing the viewport.**~~ Fixed — resize now rebuilds
  the minimap overflow cache before drawing the viewport overlay.
- ~~**Phone-width export controls clipped the last command.**~~ Fixed — mobile toolbar groups wrap
  controls into rows, and responsive e2e checks every topbar command remains inside the viewport.
- ~~**Phone-width app shell scrolled sideways.**~~ Fixed — below 760px the topbar stacks, the workbench
  changes from editor+stage columns to editor-over-stage rows, the status bar wraps, and the icon drawer
  clamps to the viewport width. A 390px Playwright regression checks that the document is no wider than
  the viewport and that editor/stage both stay inside it.
- ~~**Modal/drawer keyboard focus could leak back to the page.**~~ Fixed — the shortcuts dialog and icon
  picker now keep Tab inside while open, close on Escape, and restore focus to the triggering control.
  Focus regressions are pinned in the help and icon-picker specs.
- ~~**The public demo build could try to use a collaboration relay if `?collab` was appended.**~~ Fixed
  — the Pages demo build disables collab at compile time and reports that it is backend-free.
- ~~**`make shots` skipped when the generated `shots/` directory existed.**~~ Fixed — the app Makefile
  now marks `shots` as phony, so the visual review harness always invokes Playwright.
- ~~**The icon-picker visual shot could time out rasterizing the full registry page.**~~ Fixed — that
  flow now captures the viewport with the drawer open, while the rest of the harness keeps full-page
  screenshots.
- ~~**Some "renders X" e2e specs can pass on the lingering default sample.**~~ Fixed — every family
  "renders X" spec now routes its error capture through the shared `watchPipelineErrors` helper
  (`e2e/support/render.ts`), which collects `parse`/`layout`/`relax failed` console errors **and**
  uncaught page errors — so a *layout* or *relax* regression (which returns early, leaving the prior
  diagram on screen) is no longer invisible. For freshness, each spec also asserts the `#stage`
  `aria-label` starts with its own `"<kind> diagram:"` (and, for flowchart/C4 specs, names a specific
  parsed node) — the lingering default is a flowchart, so a stale render fails the assertion. The
  per-file hand-rolled parse-only filters (15 files) were deleted. (Not a product bug — a test-
  confidence gap.)

Resolved (internal audit sweep, 2026-06-20):

- ~~**Delete/Backspace hijacked focused text fields.**~~ Fixed — the global delete handler now also
  bails when an `<input>`/`<textarea>` (icon-filter, inline rename) has focus, so editing text there no
  longer silently deletes selected canvas nodes.
- ~~**A missing icon greyed out the whole (correct) canvas.**~~ Fixed — a failed glyph keeps the `ok`
  status + node/edge counts with an appended warning, instead of an `error` that set `data-stale`.
- ~~**Inline rename overlay drifted on scroll/resize.**~~ Fixed — it repositions on stage scroll +
  window resize while open, and stops Enter/Escape from also clearing the canvas selection.
- ~~**PNG/PDF export resolution tracked the on-screen zoom.**~~ Fixed — export re-paints at a fixed
  device scale (chrome-free), independent of zoom, matching the SVG export.

Open (external review, codex `gpt-5.5`, 2026-06-19):

- ~~**Unhandled icon-decode rejection.**~~ Fixed — `ensureIcons` now catches `img.decode()` failures
  per icon, logs loudly, skips the glyph (the painter draws box + label without it), and returns the
  failed keys; `renderFromText` surfaces them in the status bar. The diagram always paints instead of
  the fire-and-forget render aborting on an unhandled rejection.
- ~~**Inline editor ignores `viewScale`.**~~ Fixed — `openInlineEditor` maps the scene-space anchor to
  screen the same way the canvas paints (offset by extent origin, scaled by `viewScale`), so the
  overlay sits on its target after a zoom/Fit. +1 zoom e2e (offset scales with zoom).
- ~~**Requirement verb labels aren't editable.**~~ Fixed — `parseRequirementWithSource` now captures
  each verb's token span into `ReqSource.relationships`, and the inline-editor dispatch lets you edit
  a requirement relationship's verb (re-typing to another of the seven round-trips; an invalid one
  fails the parse loudly). The "double-click any … label" claim now holds for requirement too.
- ~~**Pipeline goldens omit the state family.**~~ Fixed — added flat (`state`) and `state-composite`
  samples to the pipeline goldens, so composite/`[*]` geometry regressions are now caught.
- ~~**The ER picker example referenced an undefined `PRODUCT` entity.**~~ Fixed — the showcase sample now
  defines `PRODUCT`, so selecting the example cannot fail layout on an unknown relationship endpoint.

Delete of brace-bodied entities (ER/class/requirement/composite state) is logged under `@m/builder`
(dispatch lives in `main.ts` `removeNode`, the delete helpers in the builder) — now fully resolved,
composite `state X { … }` included.

Checked while wiring Delete across C4 and sequence diagrams.

Checked while aligning inline edge-label editing with routed label placement.

Checked while making group outlines selectable.

Checked while adding editable group labels.

Checked while swapping the source textarea for CodeMirror.

Checked while adding undo/redo for canvas actions.

Checked while adding marquee box-select.

Checked while adding keyboard nudge / select-all / escape.

Checked while adding the Arrange (align/distribute) popover.

Checked while adding node resize handles.

Checked while adding the state-diagram family.

Checked while adding composite states.

Checked while fuzzing each family for odd-input crashes.

## Resolved

- ~~The C4 Examples menu entry failed to parse~~ — it used a 3-argument `Person(id, "label", "descr")`
  the C4 grammar doesn't accept; corrected to the 2-argument form. (Surfaced by the new inline
  parse-error marker.)
- ~~Empty or truncated source crashed the editor~~ — an EOF parse error gave a NaN highlight range
  that CodeMirror lint choked on; fixed in the parser (filter non-finite positions) and the editor
  (clamp/guard the diagnostic range). Found via a per-family odd-input fuzz pass.
- ~~A sidecar group outlived a text edit that removed its nodes~~ — groups (unlike overrides) weren't
  cleared on edit, so editing away and back could resurrect a phantom group onto reused ids.
  `renderFromText` now prunes groups to the live node set (`pruneGroups`). Found via the fuzz pass.

Checked interactive-control accessible names and canvas labelling (a11y pass).

Checked while adding the ER-diagram family.
Checked while preserving pinned overrides on Regenerate and adding donut/state-note visual coverage.
Checked while tightening Examples menu rendering parity; network and cloud remain explicit catalog
entries and render through the shared display-list/SVG pipeline.

Checked while reducing the GitHub Pages demo network/cloud starters to readable tiered source diagrams.

Checked while making repeated edge-style keyboard cycling derive the current arrow from the editor text
span, so a rapid second `S` press cannot reuse a stale AST edge kind.

Checked while auditing all demo example screenshots and trimming the cloud/BPMN starters so the public
catalog stays readable under the container-title routing guard.

Checked while making cloud/network style buckets first-class, restoring architecture colours, enriching
the demo catalog, and fixing dragged Gantt dependency tasks plus timeline events.

Checked while gating side-centre mount snapping to ELK/compartment box families and preserving
cloud/network first-class routing.

Checked while adding draggable route-relative edge labels, escaped multiline label rendering, state
direction, and vendored cloud/network demo icons while keeping the original BPMN glyph pack unchanged.

Resolved while pushing this PR: the UI e2e gate could reuse an unrelated local app on port 4173 and fail
against the wrong DOM. The Playwright config now starts fresh local servers for the gate.

Resolved (Miro-like round, 2026-06-23):

- ~~**A tool-change announcement overwrote the canvas's diagram aria-label.**~~ Caught while building
  the tool model — routing the "Select tool" message through `setStatusAndAnnounce` clobbered the
  canvas's screen-reader diagram description (the status helper also sets `canvas[aria-label]`). Tool
  changes now announce via the live region only; the palette's active state is the visual cue.
