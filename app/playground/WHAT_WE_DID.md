# @m/app (playground) — work log

- Scaffolded the Vite app: index.html, canvas placeholder entry, Makefile with Vite
  build/run/stop overrides, five doc files.
- Added `@m/std`/`@m/contracts`/`@m/parser`/`@m/layout`/`@m/renderer`/`@m/builder` dependencies.
- Wired the read pipeline (parse → layout → render) and a node e2e composition test.
- Added Playwright (`playwright.config.ts` + specs) — one spec per UI flow, auto-starting Vite.
- Made it interactive: source textarea ↔ canvas, edit-to-re-render, click-to-select (highlight),
  drag-to-move (sidecar override). 3 Playwright flows.
- Double-click relabel: canvas edit → `relabelNode` → textarea text patched → re-render
  (canvas → text two-way). +1 Playwright flow (dialog-driven).
- Relax / Regenerate buttons: Relax re-runs `layout(ast, seed)` from current positions;
  Regenerate clears overrides and lays out cleanly. +1 Playwright flow (drag→relax→regenerate).
- Routed rendering through `parseDiagram` + `layoutDiagram` so the playground renders **sequence**
  diagrams too; flowchart-only features (relax) guarded on `ast.kind`. +1 Playwright flow.
- Sequence two-way: double-click an actor/message → `patchSpan` rewrites its `SequenceSource`
  span in the text → re-render. +1 Playwright flow.
- **Add node** button: appends a fresh rect node to the flowchart text via `addNode`. +1 flow.
- C4 renders via the existing `parseDiagram`/`layoutDiagram` routing (explicit per-family
  source-capture switch); nested boundaries draw as container outlines. +1 Playwright flow.
