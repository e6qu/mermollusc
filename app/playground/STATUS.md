# @m/app (playground) — status

**State:** interactive editor; renders **flowchart, sequence, C4, and block**; `make check` + Playwright green.

- `main.ts`: source `<textarea>` ↔ canvas.
  - edit text → re-render via `parseDiagram` + `layoutDiagram` (flowchart / sequence / C4 / block);
  - click → hit-test + select (blue highlight); shift/⌘-click → multi-select; drag → move a node
    (sidecar override);
  - double-click rename → patches the source text (flowchart node labels; sequence actor/message
    text; C4 element/relation labels; block block/edge labels) — **canvas → text two-way for all
    four families**;
  - flowchart-only: **Add node** / **Connect** (two selected nodes → edge) buttons; **Delete** key
    removes selected nodes; **Relax** / **Regenerate** buttons.
- node e2e composition test (text → pixels) passing.
- Playwright (`make e2e-ui`): 14 flows — load, edit, click, flowchart relabel,
  drag→relax→regenerate, sequence render, sequence relabel, add-node, connect, delete,
  C4 render, C4 relabel, block render, block relabel.
- Not yet: CodeMirror editor; HTML-in-Canvas.
