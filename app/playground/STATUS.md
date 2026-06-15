# @m/app (playground) — status

**State:** interactive editor; renders **flowchart, sequence, C4, block, network, cloud**; `make check` + Playwright green.

- `main.ts`: source `<textarea>` ↔ canvas.
  - edit text → re-render via `parseDiagram` + `layoutDiagram` (all six families);
  - click → hit-test + select (blue highlight); shift/⌘-click → multi-select; drag → move a node
    (sidecar override);
  - double-click rename → patches the source text (flowchart nodes; sequence actor/message text;
    C4 element/relation; block block/edge; network node/link; cloud group/leaf/link labels) —
    **canvas → text two-way for all six families**;
  - flowchart-only: **Add node** / **Connect** (two selected nodes → edge) buttons; **Delete** key
    removes selected nodes; **Relax** / **Regenerate** buttons.
- node e2e composition test (text → pixels) passing.
- Icons in nodes: network node kinds resolve to built-in glyphs (`findIcon` → SVG → rasterised
  image, cached), handed to `paint` and drawn above each node's label.
- HiDPI: the canvas backing store is sized to `devicePixelRatio` (drawing in CSS px via a dpr
  transform) so rendering stays crisp on retina displays.
- **Load icons**: a file input decodes a user pack (`decodePack`) and merges it into the active
  registry (`registerPack`); a pack with id "arch" overrides the built-in network glyphs. This is
  how vendor cloud packs (AWS/Azure/GCP) render without being bundled. Failures log loudly.
- Theme toggle: a Dark/Light button swaps the renderer `Theme` (and the canvas surface colour) and
  repaints; the choice persists in `localStorage` and falls back to the OS `prefers-color-scheme`.
- Playwright (`make e2e-ui`): 26 flows — adds network per-node icon override to the prior 25
  (family/edit flows, cloud render/relabel, theme toggle + persistence, network-icons, dpr, load-pack ×2).
- Not yet: CodeMirror editor; HTML-in-Canvas.
