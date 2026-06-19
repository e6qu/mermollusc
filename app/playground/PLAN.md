# @m/app (playground) — plan

The web app that wires the full pipeline (parser → layout → renderer → builder) to an HTML
canvas, and hosts the e2e / golden tests.

## Responsibility

- Mount the builder onto a canvas; provide the text editor and the diagram surface, with a
  cohesive designed shell (drafting-table chrome, status/error surface, family-aware controls).
- Wire family-specific structural edits from canvas selection back into the source text.
- Keep inline canvas editors aligned with the renderer's displayed geometry.
- Treat group outlines as first-class selection affordances over the sidecar group model.
- Own the document-model seams: source text behind `Editor` (`src/editor.ts`) and the sidecar
  overlay (overrides + groups + history) behind `OverlayDoc` (`src/document-model.ts`). These isolate
  the app from storage/transport so a future collaborative (CRDT) backend plugs in as alternate
  implementations — Phase 0 of [`docs/collab-editor-plan.md`](../../docs/collab-editor-plan.md).
- Own end-to-end tests: text → pixels snapshots, and text → edit → text round-trips. The `make
  shots` harness (a separate Playwright project) additionally drives the live UI through named
  flows and writes PNGs for design review.
- Feature-detect HTML-in-Canvas (`drawElement`) and select the renderer backend.

## Public API (stable surface)

None — this is the top of the DAG. It depends on `@m/builder` only.
