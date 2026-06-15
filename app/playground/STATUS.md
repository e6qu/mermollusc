# @m/app (playground) — status

**State:** interactive text↔canvas editor; `make check` green; Playwright flows green.

- `main.ts`: source `<textarea>` ↔ canvas. Editing text re-renders (parse → layout → paint);
  click hit-tests + selects (blue highlight); drag moves a node (sidecar override + repaint).
- node e2e composition test (text → pixels) passing.
- Playwright (`make e2e-ui`): 3 flows — load renders, edit re-renders, click doesn't crash.
- Not yet: double-click relabel (canvas → text); CodeMirror editor; HTML-in-Canvas backend.
