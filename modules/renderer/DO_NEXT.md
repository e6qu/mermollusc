# @m/renderer — do next

- Measure text via the context and feed real node sizes back to layout (replace the heuristic).
- Persist the chosen theme (localStorage) and respect `prefers-color-scheme` on first load.
- Add the HTML-in-Canvas (`drawElement`) enhancement path behind feature detection.
- Add golden/pixel tests in `app` once the pipeline is wired end-to-end.
