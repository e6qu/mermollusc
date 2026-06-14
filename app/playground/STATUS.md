# @m/app (playground) — status

**State:** read path wired end to end (text → parse → layout → render); `make check` green.

- `main.ts` renders a sample flowchart onto the canvas (via `make run` / Vite dev server).
- e2e composition test runs the full pipeline in node against a recording context (1 passing).
- **Playwright** UI e2e (`make e2e-ui`): 1 flow (renders the sample, no console errors) — passing
  in chromium; runs at the pre-push stage.
- Not yet: interaction / two-way sync (needs `@m/builder`); more UI flows as the builder lands.
