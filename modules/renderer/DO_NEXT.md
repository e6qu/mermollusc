# @m/renderer — do next

- Draw arrowheads per edge kind (arrow/open/dotted/thick) and edge labels at the midpoint.
- Measure text via the context and feed real node sizes back to layout (replace the heuristic).
- Add device-pixel-ratio handling and a theme/style object (colors, fonts) instead of constants.
- Add the HTML-in-Canvas (`drawElement`) enhancement path behind feature detection.
- Add golden/pixel tests in `app` once the pipeline is wired end-to-end.
