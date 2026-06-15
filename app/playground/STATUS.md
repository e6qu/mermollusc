# @m/app (playground) — status

**State:** interactive two-way editor with relax/regenerate; `make check` green; Playwright green.

- `main.ts`: source `<textarea>` ↔ canvas.
  - edit text → re-render (parse → layout → paint);
  - click → hit-test + select (blue highlight);
  - drag → move a node (sidecar override + repaint);
  - double-click → relabel → patch the source text → re-render (**canvas → text two-way**);
  - **Relax** button → re-layout seeded by current positions; **Regenerate** → clean re-layout.
- node e2e composition test (text → pixels) passing.
- Playwright (`make e2e-ui`): 5 flows — load, edit, click, relabel, drag→relax→regenerate.
- Not yet: more two-way patches (add/connect/delete); CodeMirror; HTML-in-Canvas.
