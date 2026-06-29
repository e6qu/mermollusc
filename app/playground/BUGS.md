# @m/app (playground) — bugs

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

Checked while reducing the GitHub Pages demo network/cloud starters to readable tiered source diagrams
and replacing the cloud starter's vendor-logo tiles with built-in architecture glyphs.

Checked while making repeated edge-style keyboard cycling derive the current arrow from the editor text
span, so a rapid second `S` press cannot reuse a stale AST edge kind.

Checked while auditing all demo example screenshots and trimming the cloud/BPMN starters so the public
catalog stays readable under the container-title routing guard.

Checked while making cloud/network style buckets first-class, restoring architecture colours, enriching
the demo catalog, and fixing dragged Gantt dependency tasks plus timeline events.

Resolved (Miro-like round, 2026-06-23):

- ~~**A tool-change announcement overwrote the canvas's diagram aria-label.**~~ Caught while building
  the tool model — routing the "Select tool" message through `setStatusAndAnnounce` clobbered the
  canvas's screen-reader diagram description (the status helper also sets `canvas[aria-label]`). Tool
  changes now announce via the live region only; the palette's active state is the visual cue.
