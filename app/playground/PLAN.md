# @m/app (playground) — plan

The web app that wires the full pipeline (parser → layout → renderer → builder) to an HTML
canvas, and hosts the e2e / golden tests.

## Responsibility

- Mount the builder onto a canvas; provide the text editor and the diagram surface, with a cohesive
  computational-workbench shell (command groups, source/input panel, output stage, status/error
  surface, family-aware controls) that remains usable on narrow viewports by stacking the editor and
  stage instead of page-level scrolling sideways. Task-based game inspiration belongs in functional
  guidance and interaction affordances only; exported diagram styling stays professional and clean.
- Wire family-specific structural edits from canvas selection back into the source text.
- Keep inline canvas editors aligned with the renderer's displayed geometry.
- Treat group outlines as first-class selection affordances over the sidecar group model.
- Own the document-model seams: source text behind `Editor` (`src/editor.ts`) and the sidecar
  overlay (overrides + groups + history) behind `OverlayDoc` (`src/document-model.ts`). These isolate
  the app from storage/transport so a future collaborative (CRDT) backend plugs in as alternate
  implementations — Phase 0 of [`docs/collab-editor-plan.md`](../../docs/collab-editor-plan.md).
- Own end-to-end tests: text → pixels snapshots, and text → edit → text round-trips. The `make
  shots` harness (a separate Playwright project) additionally drives the live UI through named
  flows, including phone-width, sketch, and family-polish shots, and writes PNGs for design review.
- Keep app user stories aligned with [`docs/user_stories.md`](../../docs/user_stories.md); new
  user-facing workflows should update that story map and add deterministic Playwright/Vitest coverage
  or an explicit visual-review shot.
- Keep the Examples menu catalog in `src/examples.ts` so the app and integration tests share the
  same starter diagrams; every menu entry must parse through `parseDiagram`.
- Support the backend-free GitHub Pages demo build at `/demo/`: the app stays single-user/local-only
  there even if a visitor appends `?collab`.
- Keep the production build inspectable: Vite chunking should split editor, layout engine, collab,
  icon registry, and pipeline code so startup weight decisions are visible in build output.
- Feature-detect HTML-in-Canvas (`drawElement`) and select the renderer backend.

## Public API (stable surface)

None — this is the top of the DAG. It depends on `@m/builder` only.
