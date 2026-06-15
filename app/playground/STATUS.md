# @m/app (playground) — status

**State:** interactive editor; renders **flowchart and sequence**; `make check` + Playwright green.

- `main.ts`: source `<textarea>` ↔ canvas.
  - edit text → re-render via `parseDiagram` + `layoutDiagram` (routes flowchart vs sequence);
  - click → hit-test + select (blue highlight); drag → move a node (sidecar override);
  - flowchart-only: double-click relabel (canvas → text), **Relax** / **Regenerate** buttons.
- node e2e composition test (text → pixels) passing.
- Playwright (`make e2e-ui`): 6 flows — load, edit, click, relabel, drag→relax→regenerate, sequence render.
- Not yet: sequence two-way edit (needs sequence source spans); CodeMirror; HTML-in-Canvas.
