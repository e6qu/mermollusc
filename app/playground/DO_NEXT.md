# @m/app (playground) — do next

- Swap the textarea for CodeMirror (syntax highlight, **inline error markers at the failing span**,
  span-aware edits). The status bar now names the parse error *and its line:col* and offers
  click-to-locate (selecting the range in the textarea); CodeMirror would mark it inline instead.
- Add HTML-in-Canvas feature detection and renderer-backend selection.
- Add a pixel/golden snapshot once flows stabilize (the `make shots` harness already drives the
  flows + writes PNGs; a golden diff could assert on a curated subset).
- Make the flowchart edge-label / node prompts inline (the `window.prompt` dialogs are the last bit
  of un-designed UI).
- Drag-to-move + Connect for non-flowchart families (today they're flowchart-only and disabled
  elsewhere; the status badge reflects that).
