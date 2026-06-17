# @m/app (playground) — do next

- Swap the textarea for CodeMirror (syntax highlight, **inline error markers at the failing span**,
  span-aware edits). The status bar now names the parse error *and its line:col* and offers
  click-to-locate (selecting the range in the textarea); CodeMirror would mark it inline instead.
- Add HTML-in-Canvas feature detection and renderer-backend selection.
- Deterministic display-list goldens are wired (`test/integration/golden.test.ts`, one per family).
  Could add a *visual* pixel golden off `make shots` later, but the display-list diff already guards
  geometry without font/AA flakiness.
- Drag-to-move + Connect for non-flowchart families (today they're flowchart-only and disabled
  elsewhere; the status badge reflects that).
- The inline label editor anchors edges at the straight midpoint of their endpoints; for a bent
  edge that could sit off the visible line — anchor it on the routed path (as the renderer's label
  now does) if it proves awkward.
- Zoom polish: anchor Ctrl/⌘-wheel zoom on the cursor (adjust stage scroll so the point under the
  pointer stays put), and add background-drag panning. Today zoom is about the sheet origin and pan
  is via the stage scrollbars.
