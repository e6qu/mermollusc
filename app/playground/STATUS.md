# @m/app (playground) — status

**State:** interactive editor; renders **flowchart, sequence, C4, block, network, cloud**; `make check` + Playwright green.

- **Design:** a blueprint drafting-table UI — header (nautilus wordmark) · framed source editor
  (kind badge + grouped tools) · a graph-paper stage where each diagram is a shadowed "sheet" ·
  a status bar. Self-contained type system (serif display / geometric-humanist UI / mono editor —
  no CDN, per the repo's pinned-asset rules); cohesive light + dark, driven by a `data-theme` attr
  synced to the theme toggle.
- **Flow feedback:** the status bar names parse/layout/icon-pack errors instead of failing only to
  the console, and a failed parse **dims the stale canvas to grayscale** so a render can never
  silently masquerade as matching the text. On success it reads `kind · N nodes · M edges`. A parse
  error names its **line:col** (derived from `ParseError.positions`) and is **click-to-locate** —
  clicking the status selects the offending range in the textarea (never auto-moves the caret mid-type).
- **Family-aware controls:** an **Examples** menu drops a known-good starter for each of the six
  families; the kind badge shows the active family; Add/Connect/Relax disable off-flowchart
  (they patch flowchart text specifically) while Regenerate stays live for all.
- **UI shots harness (`make shots`):** a separate Playwright project (`playwright.shots.config.ts`
  + `e2e-shots/shots.spec.ts`) drives the live UI through named flows and writes PNGs to `shots/`
  (git-ignored) — for visual review / design iteration, not a gate.
- **Pipeline goldens (`test/integration/golden.test.ts`):** one snapshot per family of the
  parse→layout(heuristic)→display-list geometry (rounded integers) — deterministic, font-free, and
  part of `make check`. Guards against geometry regressions like an edge label drifting onto a node.

- `main.ts`: source `<textarea>` ↔ canvas.
  - edit text → re-render via `parseDiagram` + `layoutDiagram` (all six families);
  - click → hit-test + select (blue highlight); shift/⌘-click → multi-select; drag → move a node
    (sidecar override);
  - double-click rename → an **inline editor overlay** (positioned over the element; Enter/blur
    commit, Escape cancel — no modal prompt) patches the source text (flowchart nodes **and edge
    labels**; sequence actor/message text; C4 element/relation; block block/edge; network node/link;
    cloud group/leaf/link labels) — **canvas → text two-way for all six families**;
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
- **Icon picker** (`#icons-toggle`): a right-side drawer that browses the active registry (pack →
  category → glyph, with a name filter) and inserts an `icon "<pack>/<name>"` override at the editor
  caret. Previews reuse the SVG→data-URL path (no `innerHTML`); rebuilt on each open so loaded packs
  appear.
- Theme toggle: a Dark/Light button swaps the renderer `Theme` (and the canvas surface colour) and
  repaints; the choice persists in `localStorage` and falls back to the OS `prefers-color-scheme`.
- Sketch toggle: a Sketch/Crisp button composes `theme.sketch` + a handwriting font for the
  hand-drawn look; **re-lays out** (the measurer reads the active theme font, so boxes resize to the
  wider sketch font and labels stay inside their shapes).
- Source persistence: the editor text is saved to `localStorage` (via `renderFromText`, which every
  text change funnels through) so a reload restores the in-progress diagram; a fresh context starts
  on the sample.
- **Export PNG** (`#export-png`): composites the active theme background under the canvas (whose
  pixels are otherwise transparent) onto an offscreen canvas at device resolution, then downloads it
  as `mermollusc.png` via a blob URL.
- Playwright (`make e2e-ui`): 34 flows — adds PNG export + icon-picker (insert + empty-filter) to the
  prior set (source-persistence, family/edit flows incl. inline editor, sketch + theme toggles +
  persistence, cloud render/relabel, network-icons + override, dpr, load-pack ×2).
- Not yet: CodeMirror editor; HTML-in-Canvas.
