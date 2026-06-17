# @m/app (playground) — do next

- Swap the textarea for CodeMirror (syntax highlight, **inline error markers at the failing span**,
  span-aware edits). The status bar now names the parse error *and its line:col* and offers
  click-to-locate (selecting the range in the textarea); CodeMirror would mark it inline instead.
- Add HTML-in-Canvas feature detection and renderer-backend selection.
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
