# @m/app (playground) — status

**State:** interactive editor; renders **flowchart, sequence, C4, block, network, cloud, state, ER, class, requirement, gitGraph, timeline, mindmap, pie, gantt** (ER crow's-foot + attribute compartments; class UML heads + field/method compartments; requirement «kind» tags + field rows + verb arrows; pie donuts; gantt task bars on a day axis with `after`-chains); `make check` green.

**Current demo-parity note:** cloud and network have first-class style buckets and vendored default
icons; cloud defaults to trunk routing; edge labels can be dragged along their routes and preserve their
relative positions; examples are richer across families; BPMN starters keep the original BPMN glyphs for
banking and insurance-adjusting workflows; state diagrams honor direction; Gantt `after ...` bars and
timeline events work when dragged; selected nodes show cardinal mount points, and routed graph families
snap connector endpoints to those mounts after Relax and display rerenders.

- **Design:** a computational notebook/workbench UI — compact command groups in the header, a framed
  **source/input** panel, a labelled **output** stage, quieter graph-paper geometry, and a status bar.
  The palette is neutral technical chrome with a controlled red/orange accent and teal success/action
  colour, avoiding proprietary trade dress while nodding to computational tools. Self-contained type
  system (geometric-humanist UI / mono editor — no CDN, per the repo's pinned-asset rules); cohesive
  light + dark driven by a `data-theme` attr synced to the theme toggle, including native-control
  resets so dark controls stay readable. Narrow viewports stack the editor above the stage and wrap
  grouped topbar/status controls so the page itself does not scroll sideways. Current polish adds a
  restrained task-based-game influence as functional chrome only: a small task HUD, pixel-corner
  control ticks, tactical minimap language, and stronger interaction affordances. The renderer/export
  output remains professional and is not pixelated.
- **Flow feedback:** the status bar names parse/layout/icon-pack errors instead of failing only to
  the console, and a failed parse **dims the stale canvas to grayscale** so a render can never
  silently masquerade as matching the text. When there is no prior good render, the stage shows an
  explicit recovery empty state instead of a blank grid. Exports/copy are blocked while the current
  source is stale. A task strip and in-stage HUD describe the next useful action for valid, selected,
  edge-selected, and stale states. On success it reads `kind · N nodes · M edges`. A parse error names its
  **line:col** (derived from `ParseError.positions`), is **click-to-locate** (clicking the status
  selects the offending range, never auto-moving the caret mid-type), and is **mirrored inline in the
  editor** as a CodeMirror lint diagnostic — gutter marker + underline + hover message.
- **Source editor is CodeMirror 6** (`src/editor.ts`): family-aware syntax highlighting (a stream
  tokenizer over the shared keyword set; colours are CSS variables so the light/dark switch drives
  them) + line numbers. `main.ts` talks only to a small `Editor` interface, so CodeMirror types stay
  out of the app and the surface stays swappable.
- **Overlay document model** (`OverlayDoc` port in `@m/contracts`): the sidecar overlay (manual node
  positions/sizes + element groups) and its undo/redo history live behind the `OverlayDoc` interface.
  Two implementations: `createLocalDocument` (`src/document-model.ts`, single-user, localStorage-backed)
  and the Yjs-backed `@m/collab` `createCollabSession` (CRDT). `main.ts` reads/mutates the overlay only
  through `doc`, and behind a **default-off `?collab`** flag constructs the collaborative one, connects
  it to the dev relay, binds the editor to the source `Y.Text`, and labels the client for presence —
  two tabs on `?collab&room=…` edit the overlay **and the diagram text live and see each other's
  cursors**. This is the **feature-complete Phase 1** (CRDT + dev transport + source binding + presence)
  of the collaborative-editor plan
  ([`docs/collab-editor-plan.md`](../../docs/collab-editor-plan.md)) — the source-text counterpart of
  the `Editor` seam.
- **Examples are real, not gibberish:** the catalog includes a readable tiered AWS architecture
  (cloud, with directed traffic paths CloudFront→WAF→ALB→services→data/identity/operations and
  provenance-tracked vendored icons), a compact network perimeter example, and two BPMN-style workflow
  starters curated for readability rather than loop-heavy stress coverage. A **Reset** control (topbar)
  clears the persisted state and reloads a fresh demo.
- **Family-aware controls:** an **Examples** menu drops a richer known-good starter for each of the fifteen
  families (plus a **DOT/Graphviz import** entry that renders as a flowchart); the catalog lives in
  `src/examples.ts` and `test/integration/examples.test.ts` asserts every entry parses, lays out,
  lowers to `DrawCmd`s, avoids container-title crossings, and exports as SVG, with explicit `network`/`cloud` catalog guards; the kind badge shows the
  active family; Connect/Delete dispatch per family, Add/Relax disable off-flowchart, and Regenerate
  stays live for all. **⌥-drag** from a node to another creates an edge directly (a rubber-band
  preview; reuses per-family `appendEdge`); **⌘D** duplicates the selected node(s) and **⌘C / ⌘V**
  copy-paste them via a persistent in-memory clipboard (cascading each paste); a single-node drag
  **snaps to alignment** with amber guide lines, and a **corner-handle resize snaps the moving corner**
  to the same lines (the min-size clamp drops the guide when the corner can't reach it). A **?** button (or the `?` key) opens a
  shortcut-reference modal grouped by Select / Edit / Layout & groups / Tools / View.
- **Whiteboard-style tool model + on-canvas widgets (Miro-like):** a closed-union **tool mode**
  (`select | hand | connect | place`) drives the canvas. **Select** is the historical behavior verbatim
  and modifiers stay always-on accelerators in every tool (⌥-connect, ⇧-marquee, ⌘-wheel zoom never
  regress); **Hand** pans any drag (`H`, or hold **Space** in any tool); **Connect** turns a plain
  node→node drag into an edge (`C`); **Place** drops a flowchart node at the click and snaps back to
  Select (`P`, add-then-pin so geometry never enters the source). `V/H/C/P` shortcuts, `Esc`→Select,
  tool-aware cursors. A **floating tool palette** (stage-pinned `radiogroup`, roving tabindex, active
  tool in teal accent) exposes the tools and disables/falls-back the ones a family can't support. A
  **selection context mini-toolbar** floats above the selection with its applicable verbs
  (rename/shape/duplicate/connect/group/ungroup/lock/arrange/delete) — a thin view over the existing
  handlers, driven by the same `CapabilityState` record the workbench controls use, so the two surfaces
  can't drift. The zoom cluster is pinned to the stage (top-right) opposite the palette. All of this is
  editor chrome — overlay DOM only; the exported diagram is untouched.
- **UI shots harness (`make shots`):** a separate Playwright project (`playwright.shots.config.ts`
  + `e2e-shots/shots.spec.ts`) drives the live UI through named flows and writes PNGs to `shots/`
  (git-ignored) after clearing stale PNGs, and owns its preview server on a dedicated port so it
  cannot attach to a stale local process — for visual review / design iteration, not a gate. It
  includes phone-width responsive shell, shortcut-help modal, state/sketch/donut, minimap, grouping,
  and family-polish flows so task journeys and visual modes are reviewable from a clean artifact set.
- **GitHub Pages demo:** the root Pages site is reserved for presentation content; `make pages-build`
  builds the playground into `site-dist/demo/` with `VITE_BACKEND_FREE_DEMO=1`, so `/demo/` is
  local-only and never opens the collaboration relay.
- **Pipeline goldens (`test/integration/golden.test.ts`):** one snapshot per family of the
  parse→layout(heuristic)→display-list geometry (rounded integers) — deterministic, font-free, and
  part of `make check`. Guards against geometry regressions like an edge label drifting onto a node;
  refreshed after the mount-point cleanup so current source rendering is pinned.

- `main.ts`: source editor (CodeMirror) ↔ canvas.
  - edit text → re-render via `parseDiagram` + `layoutDiagram` (all fifteen families; gitGraph is
    render + inline commit-id relabel, timeline render + inline period/event relabel, mindmap render +
    inline node relabel — no structural edit for those three; pie is render-only);
  - click → hit-test + select (blue highlight); shift/⌘-click → multi-select; drag → move a node
    (sidecar override);
  - double-click rename → an **inline editor overlay** (positioned over the element; Enter/blur
    commit, Escape cancel — no modal prompt) patches the source text (flowchart nodes **and edge
    labels**; sequence actor/message text; C4 element/relation; block block/edge; network node/link;
    cloud group/leaf/link labels) — **canvas → text two-way for all families (incl. state)**;
  - structural edits: **Connect** (selected nodes → family-specific edge/relation/message; 3+ selected
    chain in click order A→B→C in one action) and
    **Delete** key (selected nodes/elements/actors or selected edges/relations/messages) work across
    every family **whose grammar accepts the result** — a per-family capability record (`familyAffordances`)
    gates **Connect** and the **icon picker**, disabled with a per-family reason on families that can't
    parse what they'd insert (Connect on pie/gitGraph/timeline/mindmap/gantt, icons off everything but
    network/cloud/block), so a toolbar click can't grey out a working diagram; **Add node** and
    **Relax** remain flowchart-only; **Regenerate** works for all and preserves pinned manual overrides
    while replacing unpinned ones.
  - **two-way edits are validated, not silently corrupting**: a relabel/edge-label commit whose new
    text contains the delimiter that would terminate its token early (`]`/`)`/`}`/`|`/`"`/newline,
    depending on the span's opening delimiter) is **rejected loudly** (status + announce) via
    `@m/builder`'s `validateLabel` / `relabelNode`, rather than writing un-parseable source.
  - **a text edit preserves manual layout**: editing the source prunes only the overrides/groups whose
    node ids the edit actually removed (after a successful layout) instead of wiping the whole overlay
    every keystroke — the dragged/resized positions of nodes that still exist survive, and the prune is
    undoable.
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
  - **resize**: a single selected node shows zoom-stable corner handles; dragging one resizes it
    (`resizeNode` override, min size, edges re-anchor), one undo step. Locked nodes show no handles.
    Edge selection now has a visible route halo and label-anchor marker, so edge relabel/delete
    affordances match node selection.
  - **keyboard affordances** (canvas-focused, so CodeMirror keeps them for the text otherwise):
    `⌘/Ctrl-A` select all nodes, `Escape` deselect, `↑↓←→` nudge the selection (Shift = a bigger
    step; a nudge run is one undo entry; locked groups don't move), and **`S` cycles the selected
    flowchart node(s) through the shapes** (rect→round→stadium→circle→diamond, rewriting the source
    brackets via `reshapeNode`, label preserved).
  - **screen-reader navigator**: a hidden listbox mirrors both nodes and edges; arrows move the active
    item, announce node topology or edge endpoints, drive canvas selection, and support Enter relabel,
    Alt+Arrow node move, two-step `c` connect between nodes, and Delete. Canvas actions announce their
    outcomes through the live region, including copy/paste, grouping, arrange, export/share, and
    layout undo/redo.
  - the **minimap** is focusable when visible and supports keyboard panning with arrow keys, Home, and
    End; forced-colors mode repaints the canvas/minimap with a high-contrast system-colour theme. Its
    overflow cache is rebuilt on viewport resize so mobile rotation and desktop resizing cannot leave
    the overview hidden or stale.
  - **Arrange** (a popover, enabled on 2+ movable units): align left/center/right/top/middle/bottom
    and distribute horizontally/vertically (3+ units). Each *unit* is a loose node or a whole top
    group, aligned by its bounding box so a group keeps its internal layout; locked groups are
    excluded. One undo step per action.
  - **undo/redo for canvas actions** (`⌘/Ctrl-Z`, `⌘⇧Z`/`Ctrl-Y`): a separate overlay-history stack
    covers drag, group/ungroup/lock, group label, and Regenerate. It's gated on the editor not being
    focused, so CodeMirror keeps `⌘Z` for the source text — the two histories don't fight.
- node e2e composition test (text → pixels) passing.
- Icons in nodes: network node kinds resolve to bundled vendor glyphs (`findIcon` → SVG → rasterised
  image, cached), handed to `paint` and drawn above each node's label.
- Visual review shots exercise the public Examples menu sources for the major families, including
  cloud, network, timeline, Gantt, DOT, and BPMN workflow starters.
- HiDPI: the canvas backing store is sized to `devicePixelRatio` (drawing in CSS px via a dpr
  transform) so rendering stays crisp on retina displays.
- **Load icons**: a file input decodes a user pack (`decodePack`) and merges it into the active
  registry (`registerPack`); a pack can override any active pack id in the registry. This is
  how non-redistributable vendor sets (AWS/Azure/GCP/Oracle/AliCloud official icons) render — convert
  a downloaded SVG folder with `tools/pack-dir.mjs`, then load it. Failures log loudly.
- **Icon picker** (`#icons-toggle`): a right-side drawer that browses the active registry (pack →
  category → glyph, with a name filter) and inserts an `icon "<pack>/<name>"` override at the editor
  caret. Previews reuse the SVG→data-URL path (no `innerHTML`); rebuilt on each open so loaded packs
  appear. The drawer has a backdrop, traps focus while open, closes on Escape/backdrop/close button,
  and restores focus to the toolbar trigger.
- Theme toggle: a Dark/Light button swaps the renderer `Theme` (and the canvas surface colour) and
  repaints; the choice persists in `localStorage` and falls back to the OS `prefers-color-scheme`.
- Sketch toggle: a Sketch/Crisp button composes `theme.sketch` + a handwriting font for the
  hand-drawn look; **re-lays out** (the measurer reads the active theme font, so boxes resize to the
  wider sketch font and labels stay inside their shapes).
- Source persistence: the editor text is saved to `localStorage` (via `renderFromText`, which every
  text change funnels through) so a reload restores the in-progress diagram; a fresh context starts
  on the sample.
- **Export** PNG (`#export-png`), PDF (`#export-pdf`), SVG (`#export-svg`), **DOT** (`#export-dot` —
  `toDot` of the displayed scene → `mermollusc.dot`, the reverse of DOT import). PNG/PDF composite the
  active theme background under the canvas (whose pixels are otherwise transparent) onto an offscreen
  canvas at device resolution: PNG via `toBlob`; PDF wraps the canvas-as-JPEG in a **hand-rolled
  minimal one-page PDF** (DCTDecode image XObject, MediaBox in CSS px so the device-res JPEG is
  high-DPI) — dependency-free. SVG is **true vector** via the renderer's `toSvg` over the same
  display list, with node icons embedded as `<image>` data-URL hrefs resolved from the registry. A
  **Copy** button (`#copy-png`) writes that same composite to the clipboard as a PNG (`ClipboardItem`),
  best-effort with a status-bar outcome.
- **Share link** (`#share-link`): encodes the current source into the URL hash (`#src=<encoded>`) and,
  when the canvas has been arranged, the **manual overlay** too (`&overlay=<encoded serializeOverlay>`),
  so a recipient sees the same positions/groups rather than a fresh auto-layout — matching what the
  image exports already produce. The hash is reflected in the address bar and copied to the clipboard
  (best-effort — outcome surfaced to the status bar). On load a `#src=` hash wins over the persisted
  source (and applies any `overlay=` it carries); each key is decoded per-`&`-segment so a literal `+`
  in the source survives. In collab mode the shared room owns the overlay, so the link stays
  source-only.
- **Loading an example** confirms first only when there is genuinely authored work to lose (the current
  text is neither the sample nor another unmodified example); switching between starters never prompts.
- **Cross-platform & a11y polish:** the CodeMirror surface carries an `aria-label` (no longer an
  unnamed textbox); the inline-rename and icon-filter inputs are labelled; the minimap is
  `role="application"`; the icon-picker close button meets the 24px target; a stale (error) canvas tells
  screen readers it's "showing the last valid render" and parse/layout errors announce. Shortcut hints
  carry `[data-mod]` chips that render `⌘/⌥/⇧` on Apple and **Ctrl/Alt/Shift** elsewhere (additive-click
  accepts Ctrl too). A **Syntax by family** section in the help overlay lists a collapsible starter per
  family from a closed-union-keyed catalog backed by the real `EXAMPLES`.
- **Self-healing collab transport:** `?collab` connects through `reconnectingWebSocketTransport` — a
  dropped relay socket reconnects with backoff and re-exchanges state, surfacing a "reconnecting" banner
  and only falling back to local editing on a permanent give-up; a remote overlay edit that fails to
  decode is surfaced (and logged via the session `Logger`) instead of throwing in the Yjs observer.
- **Module layout:** pure/self-contained helpers were lifted out of `main.ts` into focused files —
  `pdf.ts` (the dependency-free PDF builder), `raster.ts` (SVG→image), `platform.ts` (modifier-key
  swap), `syntax-reference.ts` (the help catalog) — and the alignment-snap geometry moved to
  `@m/builder`'s tested core. The render path makes **one** `parseDiagramWithSource` pass per edit
  (AST + source map together) instead of parsing each family twice, and memoises `applyOverrides` +
  group-bounds across a frame.
- Playwright (`make e2e-ui`): owns fresh local Vite and collab-relay servers for each gate run; covers requirement diagram (render/example, «kind» tags + field rows + verb arrows) + class diagram (render/example, UML heads + field/method compartments) + ER attribute blocks (crow's-foot + compartments) + ER family (render/example) + canvas a11y label + a control-accessible-name audit (incl. the editor + form inputs) + keyboard navigator node + edge coverage + mobile responsive shell/workflow coverage + group-prune-on-edit + empty/truncated-input crash guard + composite states + state-diagram render/example + pie donut render + regenerate-preserves-pinned overrides + corner-handle resize + Arrange (align-left + undo-as-one) + keyboard affordances (select-all+escape, arrow nudge) + box-select (shift-drag marquee) + undo/redo (drag-undo+redo, group-undo) + editor coverage (inline parse-error marker; highlight
  spans) + subgraph render (no-crash) + share-link (load + encode) + stadium/circle shapes + PNG +
  PDF + SVG export + icon-picker (insert + empty-filter) + an **audit-omnibus** spec (family-capability
  gating, layout-survives-edit + share-carries-overlay, example-load confirm guard, platform modifier
  chips + syntax reference) to the prior set (source-persistence,
  family/edit flows incl. inline editor, sketch + theme toggles + persistence, cloud render/relabel,
  network-icons + override, structural edit coverage for every family, group outline selection +
  label editing, dpr, load-pack ×2). Specs drive the editor through the `window.__editor` handle.
- Playwright (`make e2e-ui`): covers requirement diagram (render/example, «kind» tags + field rows + verb arrows) + class diagram (render/example, UML heads + field/method compartments) + ER attribute blocks (crow's-foot + compartments) + ER family (render/example) + canvas a11y label + keyboard navigator node + edge coverage + mobile responsive shell/workflow coverage + group-prune-on-edit + empty/truncated-input crash guard + composite states + state-diagram render/example + pie donut render + regenerate-preserves-pinned overrides + corner-handle resize + Arrange (align-left + undo-as-one) + keyboard affordances (select-all+escape, arrow nudge) + box-select (shift-drag marquee) + undo/redo (drag-undo+redo, group-undo) + editor coverage (inline parse-error marker; highlight
  spans) + subgraph render (no-crash) + share-link (load + encode) + stadium/circle shapes + PNG +
  PDF + SVG export + icon-picker (insert + empty-filter) to the prior set (source-persistence,
  family/edit flows incl. inline editor, sketch + theme toggles + persistence, cloud render/relabel,
  network-icons + override, structural edit coverage for every family, group outline selection +
  label editing, dpr, load-pack ×2). Specs drive the editor through the `window.__editor` handle.
- Not yet: HTML-in-Canvas.
- **Pinch-to-Zoom & Touch Panning:** Added multi-touch pointer event tracking to handle pinch-to-zoom and two-finger pan scrolling on the canvas viewport, avoiding layout and single-finger selection drift.
- **Mobile Bottom-Sheet Context Menu:** Restyled the selection context bar (`#context-bar`) on small screens (max-width: 500px) as a scrollable bottom-sheet, and added pure CSS rules to automatically hide the overlapping minimap and HUD when the context menu is visible.
- **Sequence Message Style Cycling:** Extended edge style cycling to sequence diagram message arrows (toggling through solid `->>`, dashed `-->>`, solid open `->`, and dashed open `-->`).
- **Visual Color Swatches:** Replaced the single-button colour cycler with a visual swatch picker group (`#ctx-colour-swatches`) on the context bar displaying themed color circles for real-time node fill styling.
- **Sequence Note Connection Guard:** Prevented connecting sequence notes (preventing invalid message routes to/from note boxes) by restricting connection capabilities.
- **Improved Context Bar Discoverability:** Show disabled context bar actions (Connect, Duplicate, Group, Arrange) with clear tooltip validation reasons instead of hiding them dynamically on node selection.
- **Keyboard Duplicate Support:** Added a keyboard shortcut (`d`/`D`) to duplicate selected nodes directly in the diagram navigator.
