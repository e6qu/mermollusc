# @m/app (playground) — status

**State:** interactive two-way editor; `make check` green; Playwright flows green.

- `main.ts`: source `<textarea>` ↔ canvas.
  - edit text → re-render (parse → layout → paint);
  - click → hit-test + select (blue highlight);
  - drag → move a node (sidecar override + repaint);
  - double-click → relabel → patch the source text → re-render (**canvas → text two-way**).
- node e2e composition test (text → pixels) passing.
- Playwright (`make e2e-ui`): 4 flows — load, edit re-renders, click, double-click relabel.
- Not yet: regenerate/relax buttons; CodeMirror editor; HTML-in-Canvas backend.
