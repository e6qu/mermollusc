# @m/app (playground) — do next

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
- Drag-to-move for non-flowchart families still needs explicit product decisions around persistence
  and whether sidecar overrides should span every family.
- *(done)* The inline label editor uses the renderer's routed-polyline edge-label anchor, so editing
  a bent edge opens on the visible label location.
- *(done)* Ctrl/⌘-wheel zoom is cursor-anchored (the point under the pointer stays put) and dragging
  the empty canvas pans the stage.
- *(done)* Element grouping: sidecar model + Group/Ungroup/Lock UI, drag-the-whole-group,
  group outlines. Follow-ups: *(done — overlay persists positions + groups to localStorage)*;
  *(done — click a group outline to select the whole group)*; *(done — editable group label/title)*.
- *(done)* Connect and Delete dispatch across all six families, including C4 boundary blocks and
  sequence actors/messages.
