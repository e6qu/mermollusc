# @m/app (playground) — do next

- *(in progress)* **Collaborative editor — Phase 1 (Yjs CRDT, in-memory).** The `OverlayDoc`
  interface moved to `@m/contracts` (shared port); `@m/collab` provides the Yjs-backed implementation
  (`createCollabSession().overlay`). The app constructs it behind a **default-off `?collab`** flag
  (`?collab` in the URL) — same `OverlayDoc`, so every call site is unchanged. With no peer wired it
  behaves identically to the local document; it proves the CRDT document drives the real app.
  **Next:** a WebSocket transport + presence, and a live CodeMirror↔`Y.Text` source binding so the flag
  drives true two-client editing. See `modules/collab/DO_NEXT.md` and `docs/collab-editor-plan.md`.
- *(done)* **Collaborative editor — Phase 0 (the seam, no infra).** Extracted the sidecar overlay
  state (overrides + groups + undo/redo history + persistence) behind an `OverlayDoc` document-model
  interface in `src/document-model.ts`; `createLocalDocument` is the single-user, localStorage-backed
  implementation, and `main.ts` reads/mutates the overlay only through that seam. This mirrors how the
  source text already sits behind the `Editor` interface (`src/editor.ts`). Pure refactor —
  behavior-neutral (all 105 Playwright specs green). A future collaborative backend plugs in as a
  second `OverlayDoc` implementation (Yjs-backed, edits broadcast via the injected `save` sink)
  **without touching call sites**. Full phased plan in [`docs/collab-editor-plan.md`](../../docs/collab-editor-plan.md)
  and the root `PLAN.md` Future bets; this is **Phase 0 of 4**.
  - **Phase 1 (next, needs sign-off):** Yjs in-memory + dev `y-websocket`; text + overlay CRDT +
    presence; local-first + reconnect. Blocked on the 5 decision points in the doc §10 (CRDT choice,
    sync model, persistence backend, auth/tenancy, server stack).
  - **Phase 2:** persistence (update log + snapshots), auth handshake, rooms + RBAC.
  - **Phase 3:** pub/sub fan-out, per-tenant isolation, audit export, observability/SLOs, offline
    buffer, compaction, compliance hooks.
- *(done)* Swapped the textarea for **CodeMirror 6**: family-aware syntax highlighting, and the
  parser's `line:col` parse error is mirrored inline as a lint diagnostic (gutter marker + underline
  + hover message) on top of the existing click-to-locate. `main.ts` talks to a small `Editor`
  interface (`src/editor.ts`) so CodeMirror types never leak into the app; e2e drives it through a
  `window.__editor` handle (`e2e/support/source.ts`) since `.fill()`/`toHaveValue()` only work on a
  `<textarea>`.
- Add HTML-in-Canvas feature detection and renderer-backend selection.
- The CodeMirror bundle pushes the production chunk past Vite's 500 kB warning; consider code-split
  (dynamic import of the editor or the icon packs) if startup weight matters.
- Deterministic display-list goldens are wired (`test/integration/golden.test.ts`, one per family).
  Could add a *visual* pixel golden off `make shots` later, but the display-list diff already guards
  geometry without font/AA flakiness.
- *(done — already worked)* Drag-to-move spans every family: the sidecar overrides + `applyOverrides`
  are family-agnostic, so dragging any family's nodes persists and survives reload (verified + e2e).
- *(done)* Undo/redo for canvas actions (`⌘Z` / `⌘⇧Z`): an overlay-history stack covers drag,
  group/ungroup/lock, group label, and Regenerate, gated on the editor not being focused so CodeMirror
  keeps `⌘Z` for the text. Possible follow-up: a unified undo that also spans text edits.
- *(done)* The inline label editor uses the renderer's routed-polyline edge-label anchor, so editing
  a bent edge opens on the visible label location.
- *(done)* Ctrl/⌘-wheel zoom is cursor-anchored (the point under the pointer stays put) and dragging
  the empty canvas pans the stage.
- *(done)* Element grouping: sidecar model + Group/Ungroup/Lock UI, drag-the-whole-group,
  group outlines. Follow-ups: *(done — overlay persists positions + groups to localStorage)*;
  *(done — click a group outline to select the whole group)*; *(done — editable group label/title)*.
- *(done)* Connect and Delete dispatch across all six families, including C4 boundary blocks and
  sequence actors/messages.
- State diagrams v1 is flat: composite/nested states, fork/join, choice, and notes are future work
  (parser-led). The `[*]` pseudo-states render as plain circles — small filled start / ringed final
  markers would read better (renderer-led). Connect/Delete/relabel work on real states; the merged
  `[*]` pseudo-states aren't meaningfully editable from the canvas.
- *(done)* ER renders crow's-foot cardinality end markers (per-end `EdgeEnd`) and entity attribute
  compartments (`SceneNode.rows`); the `er` example shows attribute blocks and a `25-er` shots flow
  captures it. Connect/Delete/relabel already work on entities + relationships. The shared `EndMarker`
  machinery would also serve a future class-diagram family.
- Fixed the `make shots` instrument to drive the source through the `window.__editor` handle (it
  still used `#src.fill()`, which broke after the CodeMirror migration).
- *(done)* UML class diagram family: field/method compartments + inheritance/composition/aggregation/
  association/dependency heads (reusing the `EndMarker` machinery). The `class` example shows them, a
  `26-class` shots flow captures it. Connect/Delete/relabel work on classes + relationships. Still
  (parser-led): class stereotypes (`<<interface>>`), per-end multiplicity labels, generics.
