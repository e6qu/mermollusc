# @m/app (playground) — status

**State:** interactive editor; renders **flowchart, sequence, C4, block, network, cloud**; `make check` + Playwright (72 specs) green.

- **Design:** a blueprint drafting-table UI — header (nautilus wordmark) · framed source editor
  (kind badge + grouped tools) · a graph-paper stage where each diagram is a shadowed "sheet" ·
  a status bar. Self-contained type system (serif display / geometric-humanist UI / mono editor —
  no CDN, per the repo's pinned-asset rules); cohesive light + dark, driven by a `data-theme` attr
  synced to the theme toggle.
- **Flow feedback:** the status bar names parse/layout/icon-pack errors instead of failing only to
  the console, and a failed parse **dims the stale canvas to grayscale** so a render can never
  silently masquerade as matching the text. On success it reads `kind · N nodes · M edges`. A parse
  error names its **line:col** (derived from `ParseError.positions`), is **click-to-locate** (clicking
  the status selects the offending range, never auto-moving the caret mid-type), and is **mirrored
  inline in the editor** as a CodeMirror lint diagnostic — gutter marker + underline + hover message.
- **Source editor is CodeMirror 6** (`src/editor.ts`): family-aware syntax highlighting (a stream
  tokenizer over the shared keyword set; colours are CSS variables so the light/dark switch drives
  them) + line numbers. `main.ts` talks only to a small `Editor` interface, so CodeMirror types stay
  out of the app and the surface stays swappable.
- **Family-aware controls:** an **Examples** menu drops a known-good starter for each of the six
  families; the kind badge shows the active family; Connect/Delete dispatch per family, Add/Relax
  disable off-flowchart, and Regenerate stays live for all.
- **UI shots harness (`make shots`):** a separate Playwright project (`playwright.shots.config.ts`
  + `e2e-shots/shots.spec.ts`) drives the live UI through named flows and writes PNGs to `shots/`
  (git-ignored) — for visual review / design iteration, not a gate.
- **Pipeline goldens (`test/integration/golden.test.ts`):** one snapshot per family of the
  parse→layout(heuristic)→display-list geometry (rounded integers) — deterministic, font-free, and
  part of `make check`. Guards against geometry regressions like an edge label drifting onto a node.

- `main.ts`: source editor (CodeMirror) ↔ canvas.
  - edit text → re-render via `parseDiagram` + `layoutDiagram` (all six families);
  - click → hit-test + select (blue highlight); shift/⌘-click → multi-select; drag → move a node
    (sidecar override);
  - double-click rename → an **inline editor overlay** (positioned over the element; Enter/blur
    commit, Escape cancel — no modal prompt) patches the source text (flowchart nodes **and edge
    labels**; sequence actor/message text; C4 element/relation; block block/edge; network node/link;
    cloud group/leaf/link labels) — **canvas → text two-way for all six families**;
  - structural edits: **Connect** (two selected nodes → family-specific edge/relation/message) and
    **Delete** key (selected nodes/elements/actors or selected edges/relations/messages) work across
    all six families; **Add node** and **Relax** remain flowchart-only; **Regenerate** works for all.
  - inline edge-label editing uses the renderer's routed-polyline label anchor, so bent-edge editors
    open at the visible label location.
  - group outlines are selectable: clicking an outline selects all leaf nodes in that group, enabling
    the existing Ungroup/Lock controls.
  - group labels are sidecar metadata: double-click a group outline to edit its title; the label
    renders as a fieldset-style legend on the top border (a background notch breaks the outline so
    the text reads cleanly); overlay persistence keeps it across reloads.
  - **drag-to-move works for every family** (the sidecar overrides + `applyOverrides` are
    family-agnostic; dragging persists to the overlay and survives reload).
  - **box-select**: shift-drag on the empty canvas draws a marquee and adds every node it touches to
    the selection (plain drag still pans) — fast multi-select for Group / multi-move / Delete.
  - **resize**: a single selected node shows corner handles; dragging one resizes it (`resizeNode`
    override, min size, edges re-anchor), one undo step. Locked nodes show no handles.
  - **keyboard affordances** (canvas-focused, so CodeMirror keeps them for the text otherwise):
    `⌘/Ctrl-A` select all nodes, `Escape` deselect, and `↑↓←→` nudge the selection (Shift = a bigger
    step; a nudge run is one undo entry; locked groups don't move).
  - **Arrange** (a popover, enabled on 2+ movable units): align left/center/right/top/middle/bottom
    and distribute horizontally/vertically (3+ units). Each *unit* is a loose node or a whole top
    group, aligned by its bounding box so a group keeps its internal layout; locked groups are
    excluded. One undo step per action.
  - **undo/redo for canvas actions** (`⌘/Ctrl-Z`, `⌘⇧Z`/`Ctrl-Y`): a separate overlay-history stack
    covers drag, group/ungroup/lock, group label, and Regenerate. It's gated on the editor not being
    focused, so CodeMirror keeps `⌘Z` for the source text — the two histories don't fight.
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
- **Export** PNG (`#export-png`), PDF (`#export-pdf`), SVG (`#export-svg`). PNG/PDF composite the
  active theme background under the canvas (whose pixels are otherwise transparent) onto an offscreen
  canvas at device resolution: PNG via `toBlob`; PDF wraps the canvas-as-JPEG in a **hand-rolled
  minimal one-page PDF** (DCTDecode image XObject, MediaBox in CSS px so the device-res JPEG is
  high-DPI) — dependency-free. SVG is **true vector** via the renderer's `toSvg` over the same
  display list, with node icons embedded as `<image>` data-URL hrefs resolved from the registry.
- **Share link** (`#share-link`): encodes the current source into the URL hash (`#src=<encoded>`,
  reflected in the address bar) and copies the link to the clipboard (best-effort — the outcome is
  surfaced to the status bar). On load a `#src=` hash wins over the persisted source, which wins over
  the sample.
- Playwright (`make e2e-ui`): 72 flows — adds corner-handle resize + Arrange (align-left + undo-as-one) + keyboard affordances (select-all+escape, arrow nudge) + box-select (shift-drag marquee) + undo/redo (drag-undo+redo, group-undo) + editor coverage (inline parse-error marker; highlight
  spans) + subgraph render (no-crash) + share-link (load + encode) + stadium/circle shapes + PNG +
  PDF + SVG export + icon-picker (insert + empty-filter) to the prior set (source-persistence,
  family/edit flows incl. inline editor, sketch + theme toggles + persistence, cloud render/relabel,
  network-icons + override, structural edit coverage for every family, group outline selection +
  label editing, dpr, load-pack ×2). Specs drive the editor through the `window.__editor` handle.
- Not yet: HTML-in-Canvas.
