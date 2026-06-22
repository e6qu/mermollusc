# @m/app (playground) — bugs

Resolved (collab-era audit sweep):

- ~~**Phone-width app shell scrolled sideways.**~~ Fixed — below 760px the topbar stacks, the workbench
  changes from editor+stage columns to editor-over-stage rows, the status bar wraps, and the icon drawer
  clamps to the viewport width. A 390px Playwright regression checks that the document is no wider than
  the viewport and that editor/stage both stay inside it.
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
