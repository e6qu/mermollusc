# @m/app (playground) — status

**State:** interactive editor; renders **flowchart, sequence, and C4**; `make check` + Playwright green.

- `main.ts`: source `<textarea>` ↔ canvas.
  - edit text → re-render via `parseDiagram` + `layoutDiagram` (routes flowchart / sequence / C4);
  - click → hit-test + select (blue highlight); drag → move a node (sidecar override);
  - double-click rename → patches the source text (flowchart node labels; sequence actor/message
    text) — **canvas → text two-way for both families**;
  - flowchart-only: **Add node** appends a node to the text; **Relax** / **Regenerate** buttons.
- node e2e composition test (text → pixels) passing.
- Playwright (`make e2e-ui`): 9 flows — load, edit, click, flowchart relabel,
  drag→relax→regenerate, sequence render, sequence relabel, add-node, C4 render.
- Not yet: C4 two-way edit; CodeMirror editor; HTML-in-Canvas; connect/delete UI.
