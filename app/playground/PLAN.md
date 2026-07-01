# @m/app (playground) — plan

The web app that wires the full pipeline (parser → layout → renderer → builder) to an HTML
canvas, and hosts the e2e / golden tests.

## Demo rendering parity

- Keep the demo catalog at parity with renderer/layout capabilities. Cloud and network are first-class
  style families, cloud defaults to trunk routing, and examples exercise architecture colours, crossing
  hints, Gantt/timeline drag behavior, and realistic BPMN workflow glyphs.
- Keep edge labels as first-class canvas objects: label hit-testing, dragging, selection handles, inline
  editors, selected-edge route handles, and export coordinates must all use the same route-relative
  anchor.
- Keep Regenerate semantics covered end to end for both overlay sources: manual pinned positions remain,
  imported unpinned positions are discarded, and the public hash/share path follows the same rule.
- Show selected-node cardinal mount points in the canvas, keep them visible in light and dark themes,
  and keep routed graph endpoints attached to those mounts after Relax, drag rerenders, and style
  overlays.
- Use provenance-tracked original vendor icon packs for public cloud/network starters and defaults when
  the bundled registry contains the needed glyphs; demo icon tests must assert painted glyph pixels, not
  only the absence of registry errors.
- Gate mount snapping by diagram family only where the family has no routed node-to-node connector
  semantics; architecture and compartment families use the same cardinal endpoint contract.

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
- Keep disabled editing affordances explainable without hover: when a family cannot Add, Relax,
  Connect, or Duplicate, the always-visible task guidance must surface the same reason as the disabled
  control title.
- Keep transient command confirmations and durable diagram status separate: add/duplicate/connect/shape
  acknowledgements may refresh task guidance, but must not replace the canvas diagram label or
  stale/error state.
- Keep pointer-only canvas promises paired with keyboard paths: a resizable selected node can be resized
  with corner drag or `Alt+Arrow` (`Shift` for a larger step), and the shortcut is visible in the demo
  hints/help.
- Keep keyboard navigation audibly stateful: minimap arrow/Home/End panning, navigator movement,
  nudging, resizing, grouping, and lock changes should all report concise results through the shared
  live region.
- Keep the Examples menu catalog in `src/examples.ts` so the app and integration tests share the
  same starter diagrams; every menu entry must parse, lay out, pass container-title routing guards,
  pass cardinal endpoint mount guards for routed graph families, lower to a display list, and export as
  SVG. Network and cloud examples are explicit catalog requirements.
- Support the backend-free GitHub Pages demo build at `/demo/`: the app stays single-user/local-only
  there even if a visitor appends `?collab`.
- Keep the production build inspectable: Vite chunking should split editor, layout engine, collab,
  icon registry, and pipeline code so startup weight decisions are visible in build output.
- Feature-detect HTML-in-Canvas (`drawElement`) and select the renderer backend.
- Multi-touch pinch-to-zoom and two-finger panning gesture tracking on the canvas viewport.
- Mobile-responsive selection context bar acting as a scrollable bottom-sheet, automatically hiding HUD and minimap components on phone viewports.

## Public API (stable surface)

None — this is the top of the DAG. It depends on `@m/builder` only.
