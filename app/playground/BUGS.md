# @m/app (playground) — bugs

Open (external review, codex `gpt-5.5`, 2026-06-19):

- ~~**Unhandled icon-decode rejection.**~~ Fixed — `ensureIcons` now catches `img.decode()` failures
  per icon, logs loudly, skips the glyph (the painter draws box + label without it), and returns the
  failed keys; `renderFromText` surfaces them in the status bar. The diagram always paints instead of
  the fire-and-forget render aborting on an unhandled rejection.
- **Inline editor ignores `viewScale`.** After zoom in/out or Fit, the `#inline-edit` overlay opens at
  unscaled scene coordinates, off the target node/edge label. Scale the anchor by `viewScale`
  (account for canvas rect + scroll). *(P2, open.)*
- **Requirement verb labels aren't editable** despite the "double-click any … label" claim
  (`ReqSource.relationships` is intentionally empty). Capture verb spans + cycle the seven verbs, or
  drop the claim for requirement. *(P2, open.)*
- ~~**Pipeline goldens omit the state family.**~~ Fixed — added flat (`state`) and `state-composite`
  samples to the pipeline goldens, so composite/`[*]` geometry regressions are now caught.

Delete of brace-bodied entities (ER/class/requirement) is logged under `@m/builder` (dispatch lives
in `main.ts` `removeNode`, the delete helpers in the builder).

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
