# @m/app (playground) — status

**State:** interactive editor; renders **flowchart and sequence**; `make check` + Playwright green.

- `main.ts`: source `<textarea>` ↔ canvas.
  - edit text → re-render via `parseDiagram` + `layoutDiagram` (routes flowchart vs sequence);
  - click → hit-test + select (blue highlight); drag → move a node (sidecar override);
  - double-click rename → patches the source text (flowchart node labels; sequence actor/message
    text) — **canvas → text two-way for both families**;
  - flowchart-only: **Relax** / **Regenerate** buttons.
- node e2e composition test (text → pixels) passing.
- Playwright (`make e2e-ui`): 7 flows — load, edit, click, flowchart relabel,
  drag→relax→regenerate, sequence render, sequence relabel.
- Not yet: CodeMirror editor; HTML-in-Canvas; add/connect/delete patches.
