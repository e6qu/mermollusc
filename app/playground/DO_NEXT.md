# @m/app (playground) — do next

- *(in progress)* **Collaborative editor — Phase 1 (Yjs CRDT).** The `OverlayDoc` port lives in
  `@m/contracts`; `@m/collab` provides the Yjs session. Behind a **default-off `?collab`** flag the app
  connects to the dev relay (`make collab-server`) and binds the editor to the source `Y.Text` via
  `collabSession.sourceBinding()`: two tabs on `?collab&room=…` edit **both the overlay and the diagram
  text** live, each re-deriving locally. `createEditor` gained an `extra`-extensions hook + a
  `textHistory` flag (collab drops CM's own history so Yjs owns ⌘Z); collab mode seeds the room if empty
  and doesn't clear the shared overlay on a text edit. It also labels the client (`setLocalUser`) so
  **remote cursors** render in peers' editors. Four Playwright specs cover the single-tab Yjs path,
  two-tab overlay convergence, source sync, and presence. **Phase 1 is feature-complete.** Phase 2
  (server-side) added durable persistence, Auth0 verification, and rooms + RBAC; the app now also
  **reflects the role** — a viewer's editor + canvas are read-only (the relay sends the role as a
  control frame). **Next (Phase 2 cont.):** the browser Auth0 login + the production store. See
  `modules/collab/DO_NEXT.md` + `docs/collab-editor-plan.md`.
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
- The production app still builds as one large JS chunk: `make build` reports
  `dist/assets/index-*.js` at about **2.8 MB minified / 845 kB gzip**, past Vite's 500 kB warning.
  Consider code-splitting if startup weight matters; likely targets are the editor surface and/or
  bundled icon packs. Do not suppress the warning without a deliberate size budget.
- *(done)* Responsive shell polish: the topbar/workbench/status bar no longer force page-level
  horizontal scrolling on phone-width viewports; the editor and stage stack vertically, with the
  diagram sheet still scrolling inside the stage.
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
- **Accessibility arc** (keyboard diagram navigator landed). Next:
  - *(done)* announce a node's connections as you navigate.
  - *(done)* reach/focus edges from the navigator; edges are announced by endpoints, can be relabelled
    with Enter, and Delete removes the selected edge while leaving endpoint nodes intact.
  - Keyboard operation parity *(done)*: navigate · Enter relabel · Alt+Arrow move · two-step `c` connect ·
    Delete remove.
  - *(done)* Announce action outcomes via the live region: relabel, delete, connect, copy/paste,
    group/ungroup/lock, arrange, export/share, theme/sketch, and layout undo/redo.
  - Polish *(done)*: `prefers-reduced-motion` collapses all motion; a visible navigator focus ring on the
    stage; a contrast audit (every label/stroke pair clears WCAG AA, guarded by a renderer test).
  - *(done)* Help modal and icon drawer keep keyboard focus contained while open and restore focus to
    their trigger on close.
