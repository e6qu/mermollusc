# @m/app (playground) — status

**State:** interactive editor; renders **flowchart, sequence, C4, block, and network**; `make check` + Playwright green.

- `main.ts`: source `<textarea>` ↔ canvas.
  - edit text → re-render via `parseDiagram` + `layoutDiagram` (flowchart/sequence/C4/block/network);
  - click → hit-test + select (blue highlight); shift/⌘-click → multi-select; drag → move a node
    (sidecar override);
  - double-click rename → patches the source text (flowchart node labels; sequence actor/message
    text; C4 element/relation labels; block block/edge labels; network node/link labels) —
    **canvas → text two-way for all five families**;
  - flowchart-only: **Add node** / **Connect** (two selected nodes → edge) buttons; **Delete** key
    removes selected nodes; **Relax** / **Regenerate** buttons.
- node e2e composition test (text → pixels) passing.
- Icons in nodes: network node kinds resolve to built-in glyphs (`findIcon` → SVG → rasterised
  image, cached), handed to `paint` and drawn above each node's label.
- HiDPI: the canvas backing store is sized to `devicePixelRatio` (drawing in CSS px via a dpr
  transform) so rendering stays crisp on retina displays.
- Playwright (`make e2e-ui`): 18 flows — the 16 family/edit flows plus network-icons and dpr.
- Not yet: CodeMirror editor; dark-theme toggle; HTML-in-Canvas.
