# @m/app (playground) — do next

- Swap the textarea for CodeMirror (syntax highlight, **inline error markers at the failing span**,
  span-aware edits) — the status bar now names parse errors, but can't point at the offending range.
- Add HTML-in-Canvas feature detection and renderer-backend selection.
- Add a pixel/golden snapshot once flows stabilize (the `make shots` harness already drives the
  flows + writes PNGs; a golden diff could assert on a curated subset).
- Make the flowchart edge-label / node prompts inline (the `window.prompt` dialogs are the last bit
  of un-designed UI).
- Drag-to-move + Connect for non-flowchart families (today they're flowchart-only and disabled
  elsewhere; the status badge reflects that).
