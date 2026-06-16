# @m/app (playground) — status

**State:** interactive editor; renders **flowchart, sequence, C4, block, network, cloud**; `make check` + Playwright green.

- `main.ts`: source `<textarea>` ↔ canvas.
  - edit text → re-render via `parseDiagram` + `layoutDiagram` (all six families);
  - click → hit-test + select (blue highlight); shift/⌘-click → multi-select; drag → move a node
    (sidecar override);
  - double-click rename → patches the source text (flowchart nodes **and edge labels**; sequence
    actor/message text; C4 element/relation; block block/edge; network node/link; cloud
    group/leaf/link labels) — **canvas → text two-way for all six families**;
  - flowchart-only: **Add node** / **Connect** (two selected nodes → edge) buttons; **Delete** key
    removes selected nodes (`deleteNode`) or a selected edge (`deleteEdge`); **Relax** / **Regenerate**.
- node e2e composition test (text → pixels) passing.
- Icons in nodes: network node kinds resolve to built-in glyphs (`findIcon` → SVG → rasterised
  image, cached), handed to `paint` and drawn above each node's label.
- HiDPI: the canvas backing store is sized to `devicePixelRatio` (drawing in CSS px via a dpr
  transform) so rendering stays crisp on retina displays.
- **Load icons**: a file input decodes a user pack (`decodePack`) and merges it into the active
  registry (`registerPack`); a pack with id "arch" overrides the built-in network glyphs. This is
  how non-redistributable vendor sets (AWS/Azure/GCP/Oracle/AliCloud official icons) render — convert
  a downloaded SVG folder with `tools/pack-dir.mjs`, then load it. Failures log loudly.
- Theme toggle: a Dark/Light button swaps the renderer `Theme` (and the canvas surface colour) and
  repaints; the choice persists in `localStorage` and falls back to the OS `prefers-color-scheme`.
- Sketch toggle: a Sketch/Crisp button composes `theme.sketch` + a handwriting font for the
  hand-drawn look; repaints (no re-layout).
- Playwright (`make e2e-ui`): 29 flows — adds edge-label relabel + edge delete to the prior 27 (family/edit
  flows, sketch + theme toggles + persistence, cloud render/relabel, network-icons + override, dpr, load-pack ×2).
- Not yet: CodeMirror editor; HTML-in-Canvas.
