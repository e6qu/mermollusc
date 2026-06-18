# @m/app (playground) — work log

- Scaffolded the Vite app: index.html, canvas placeholder entry, Makefile with Vite
  build/run/stop overrides, five doc files.
- Added `@m/std`/`@m/contracts`/`@m/parser`/`@m/layout`/`@m/renderer`/`@m/builder` dependencies.
- Wired the read pipeline (parse → layout → render) and a node e2e composition test.
- Added Playwright (`playwright.config.ts` + specs) — one spec per UI flow, auto-starting Vite.
- Made it interactive: source textarea ↔ canvas, edit-to-re-render, click-to-select (highlight),
  drag-to-move (sidecar override). 3 Playwright flows.
- Double-click relabel: canvas edit → `relabelNode` → textarea text patched → re-render
  (canvas → text two-way). +1 Playwright flow (dialog-driven).
- Relax / Regenerate buttons: Relax re-runs `layout(ast, seed)` from current positions;
  Regenerate clears overrides and lays out cleanly. +1 Playwright flow (drag→relax→regenerate).
- Routed rendering through `parseDiagram` + `layoutDiagram` so the playground renders **sequence**
  diagrams too; flowchart-only features (relax) guarded on `ast.kind`. +1 Playwright flow.
- Sequence two-way: double-click an actor/message → `patchSpan` rewrites its `SequenceSource`
  span in the text → re-render. +1 Playwright flow.
- **Add node** button: appends a fresh rect node to the flowchart text via `addNode`. +1 flow.
- C4 renders via the existing `parseDiagram`/`layoutDiagram` routing (explicit per-family
  source-capture switch); nested boundaries draw as container outlines. +1 Playwright flow.
- C4 two-way: the source-capture switch now keeps a `C4Source` (via `parseC4WithSource`); double-
  click an element or relation → `patchSpan` rewrites its inner-label span in the text → re-render.
  +1 Playwright flow.
- Builder UI affordances (flowchart): shift/⌘-click multi-select (tracked in click order so a
  direction exists); **Connect** button joins the first two selected nodes via `connect`; the
  **Delete** key removes selected nodes via `deleteNode` (guarded off while the textarea is
  focused). +2 Playwright flows.
- Block family renders via the existing `parseDiagram`/`layoutDiagram` routing. +1 Playwright flow.
- Block two-way: the source-capture switch keeps a `BlockSource` (via `parseBlockWithSource`);
  double-click a block or labelled edge → `patchSpan` rewrites its label span → re-render.
  Refactored the switch to reset all four source holders up front. +1 Playwright flow.
- Network family: renders kind-typed nodes + undirected links via `parseDiagram`/`layoutDiagram`;
  two-way via a `NetworkSource` (double-click a node or labelled link → `patchSpan`). +2 flows.
- Icons in nodes: added `@m/icons` as a dependency; `ensureIcons(scene)` resolves each
  `SceneNode.icon` via `findIcon`, rasterises the SVG to an `Image` (xmlns + size injected, data
  URL), caches it by `${pack}/${name}`, and hands the map to `paint`. +1 Playwright flow.
- HiDPI: `paintScene` sizes the canvas backing store to `devicePixelRatio`, pins the CSS box size,
  and draws in CSS px via a dpr `setTransform`. +1 Playwright flow (deviceScaleFactor 2).
- "Load icons" affordance: a file input reads a pack, `decodePack` validates it at the boundary,
  `registerPack` merges it into a mutable registry (clearing the rasterised-glyph cache), and the
  scene re-renders; a same-id pack overrides the built-in. Loud on parse/decode failure. +2 flows.
- Dark/Light theme toggle: swaps the renderer `Theme` and the canvas `backgroundColor`, repaints. +1 flow.
- Cloud family renders via the existing `parseDiagram`/`layoutDiagram` routing: nested group
  containers + service-kind glyphs (now the vendored simple-icons brand marks). +1 Playwright flow.
- Made the SVG rasteriser inject `xmlns`/size only when absent, so vendored packs that already
  declare a namespace (simple-icons) decode without a duplicate-attribute error.
- Sketch toggle: composes `theme.sketch` + a system handwriting font onto the active (light/dark)
  theme and repaints for the hand-drawn look. +1 Playwright flow.
- Flowchart edge labels are now two-way: double-clicking a labelled edge patches its `|label|` span
  (via the `SourceMap.edges` map). +1 Playwright flow.
- The Delete key now also removes a selected edge (`deleteEdge` on the scene edge's from/to). +1 flow.
- Layout now sizes nodes with real text metrics: an offscreen-canvas `measureText` measurer is passed
  to `layoutDiagram`/`layout` (replacing the char-width guess; short labels still hit the min-width floors).
- Cloud two-way: the source-capture switch keeps a `CloudSource` (via `parseCloudWithSource`);
  double-click a group, service leaf, or labelled link → `patchSpan` rewrites its label span. +1 flow.
- Theme persistence: initial theme reads `localStorage` then falls back to `prefers-color-scheme`;
  the toggle persists the explicit choice. +2 Playwright flows (OS preference, persist-over-reload).
- UI shots harness: a separate Playwright project (`playwright.shots.config.ts` + `e2e-shots/`)
  drives the live UI through named flows and screenshots each to `shots/` (git-ignored), wired as
  `make shots`. Doubles as the design-review instrument and an end-to-end flow exerciser. Captured
  a baseline before the redesign to compare against.
- Frontend redesign (drafting-table aesthetic): rewrote `index.html` into a full-viewport app —
  header/wordmark, framed source editor, graph-paper stage with the diagram as a shadowed sheet,
  status bar — with a self-contained CSS design-token system (no CDN font), cohesive light/dark via
  a `data-theme` attribute synced to the theme toggle. Decorated the Dark/Sketch buttons with
  CSS-only glyphs so their `textContent` (asserted by e2e) is untouched.
- Flow feedback: a `setStatus(level, message)` surfaces parse/layout/icon-pack failures to the
  status bar (still logging loudly) and marks the stage `data-stale` so a failed parse dims the now-
  mismatched canvas to grayscale instead of silently showing the last good render. Success reads
  `kind · N nodes · M edges` (correctly singularised).
- Family-aware UI: an **Examples** `<select>` loads a known-good starter per family; `applyKind`
  updates the kind badge and disables the flowchart-only Add/Connect/Relax off-flowchart (Regenerate
  stays enabled). All 29 gating Playwright flows stay green (IDs + button text preserved).
- Parse-error locating: `setStatus` takes an optional range from `ParseError.positions[0]`; the status
  bar shows `parse error (line L:C) — … · click to locate` and clicking it focuses the textarea and
  selects the range (`lineColOf` derives line/col). The caret is never moved automatically — the parse
  runs on every keystroke, so seizing the selection would fight the typist.
- Pipeline goldens (`test/integration/golden.test.ts`): for one sample per family, parse → layout
  (default heuristic measurer — no canvas/fonts) → `toDisplayList`, normalised to rounded-integer
  strings and snapshotted. Deterministic; catches geometry regressions (e.g. an edge label drifting
  onto a node) that pixels would catch but unit tests miss, without font/AA flakiness. +6 snapshots.
- Inline label editor: replaced the `window.prompt` dialogs with an overlay `<input>` (`#inline-edit`)
  positioned over the double-clicked element — Enter/blur commit, Escape cancels, one at a time. The
  dblclick handler now computes a `{ text, commit }` per family (span patch, or `relabelNode` for a
  flowchart node) plus a screen anchor, then opens the editor. Rewrote the 7 edit specs to drive
  `#inline-edit` instead of `page.on("dialog")`, and added an `11-inline-edit` shot. 29 e2e green.
- Source persistence: `renderFromText` writes the current text to `localStorage` under
  `mermollusc-source` (the single chokepoint every text change funnels through), and initial load
  reads it (`?? SAMPLE`). A reload restores the in-progress diagram — even mid-edit / not-yet-parsing.
  +2 Playwright flows (persists-across-reload, fresh-context-shows-sample). 31 e2e green.
- Icon picker drawer (`#icons-toggle`): browses the active registry grouped by pack → category with
  a name filter, and inserts an `icon "<pack>/<name>"` override at the textarea caret on click.
  Extracted `svgDataUrl` (shared with `rasterizeIcon`) so previews are `<img>` elements built via
  `createElement` (no `innerHTML`); the grid rebuilds on each open so loaded packs show. +2 Playwright
  flows (filter+insert, empty-filter) and a `12-icon-picker` shot. 33 e2e green.
- Sketch-aware layout: `measureLabel` now measures with the active theme font (`activeTheme().font`)
  instead of a fixed `14px sans-serif`, and the Sketch toggle re-lays out (`renderFromText`) instead
  of only repainting — so nodes resize to the wider handwriting font and labels stay inside their
  boxes. No-op outside Sketch (both base themes are `14px sans-serif`).
- Export PNG (`#export-png`): composites the active theme background under the canvas onto an
  offscreen canvas at device resolution (the canvas pixels are transparent — the surface colour is
  CSS-only), then downloads `mermollusc.png` via a blob URL + `<a download>`. +1 Playwright flow
  (asserts the download filename + that it resolves to a real file).
- Export PDF (`#export-pdf`): dependency-free. Extracted `compositeCanvas` + `downloadBlob` (shared
  with PNG), then `buildImagePdf` hand-assembles a minimal one-page PDF — a DCTDecode image XObject
  (the composited canvas as JPEG) placed to fill a MediaBox sized in CSS px (so the device-res JPEG
  renders high-DPI), tracking byte offsets for the xref. Verified the output renders. +1 Playwright
  flow (download filename + real file). 35 e2e green.
- Export SVG (`#export-svg`): true vector, via the renderer's `toSvg` over `toDisplayList(shown)`.
  Node icons are embedded as `<image>` data-URL hrefs resolved here (the renderer can't depend on
  `@m/icons`) via `findIcon` + `svgDataUrl`. Verified the output renders correctly in a browser.
  +1 Playwright flow (download filename + real file). 36 e2e green.
- Shareable links (`#share-link`): `shareUrl()` encodes the editor text into a `#src=<encoded>` URL
  hash; the Share button reflects it in the address bar (`history.replaceState`) and best-effort
  copies it to the clipboard (outcome surfaced to the status bar, never silently dropped). On load,
  a `#src=` hash takes precedence over the persisted source (`hashSource()` → `?? localStorage ??
  SAMPLE`). +2 Playwright flows (link reproduces the diagram; Share encodes the source). 39 e2e green.
- Canvas zoom/navigation: a topbar control (− / %level / + / Fit) plus Ctrl/⌘-wheel. `Fit` scales the
  sheet so a diagram taller/wider than the stage is fully visible (never upscaling past 100%); zoom
  re-renders at the new scale (crisp, not a bitmap scale) by folding a `viewScale` into the canvas
  sizing + ctx transform, and `scenePoint` divides by it. Default stays 1 (identity), so the existing
  hit-test/e2e pixel math is unchanged. +2 e2e specs (42 Playwright) and +2 `make shots` captures.
- Zoom/pan polish: Ctrl/⌘-wheel zoom is now cursor-anchored (measure the canvas rect before/after the
  re-render and nudge stage scroll to cancel drift — no centred/padded-container math), and dragging
  the empty canvas pans the stage (grab cursor; scrolls via `stage-wrap`). +1 e2e (pan), verified the
  pan visually with a stage-viewport element screenshot.
- Overview **minimap** (designed with the frontend-design skill, verified via close-up screenshots
  in light + dark). Pinned bottom-right of the stage (in a new `.stage-col` wrapper so it doesn't
  scroll with the sheet), shown only when the diagram overflows. It renders a *simplified* view from
  the cached scene — solid node blocks + faint edges, not a shrunk copy of the canvas (labels/icons
  would be noise at ~180px) — and marks the visible region by dimming everything outside it with a
  scrim and framing it in the drafting-table accent ("you are here"). Click or drag to recentre the
  stage; redraws cheaply on scroll/pan/zoom/resize from the cached display data. +4 e2e (hidden when
  fitting, appears/hides on overflow, click- and drag-to-navigate) and +2 shot captures.
  - Refined the "you are here" lens: the viewport rectangle's stroke is inset and clamped inside the
    sheet so it's never half-clipped when the viewport butts against an edge (the common scrollTop=0
    case), and the visible region now carries a faint accent tint so it reads as a lit lens against
    the surrounding scrim — pushing contrast from both sides. Verified light + dark via close-ups.
- Multi-node drag: a plain click on an already-multi-selected node now drags the *whole* selection
  together (one pointer delta applied to every member from its start position); plus connector
  re-anchoring + extent growth via `applyOverrides`. Foundation for grouped-element moves. +2 e2e
  (sheet grows on drag-out; shift-selected pair moves together, source untouched).
- Grouping UI (on the sidecar group model): Group / Ungroup / Lock controls in the editor tools,
  enabled by selection. Group bundles the selected nodes' top-level units (nesting existing groups,
  in selection order); Ungroup dissolves the selection's group; Lock toggles a move-only lock
  (button reads Lock/Unlock). Dragging any member moves the whole group (leaves resolved via
  `topGroupOfNode`/`leafNodes`, on the move-together + connector-re-anchor foundation); a locked
  group is selectable but not draggable (`pathLocked`). Each group draws a rounded outline behind the
  nodes — dashed accent when unlocked, solid + padlock when locked, nested groups nesting visually.
  Verified in light + dark via shots; +2 e2e (controls toggle + Ungroup reverses; locked-can't-drag,
  unlock-restores). 51 Playwright.
- Persist the sidecar overlay (manual positions + groups) to localStorage alongside the source, via
  `@m/builder`'s `serializeOverlay`/`decodeOverlay`. Restored on load only for the persisted source
  (a share-link source is a different diagram); a corrupt/invalid overlay is logged loudly and
  ignored. +2 e2e (a dragged position and a group both survive a reload). 53 Playwright.
- Connect + Delete now work beyond flowchart: enabled for every family with a two-token edge syntax
  (flowchart/block draw `-->`, network/cloud `--`). The Connect button is family-gated and dispatches
  directed vs undirected; the Delete key removes selected nodes (+ their edges) / selected edges for
  those families. Sequence (messages) and C4 (`Rel(...)`) have distinct syntax — not wired yet.
  +2 e2e (network Connect appends `a -- b`; Delete removes a node and its links).
- Connect now works for *all six* families: the handler dispatches by kind to the right edge syntax
  (`-->` flowchart/block, `--` network/cloud, `Rel(a,b,"")` C4, `A->>B: message` sequence). The
  button is enabled for every family. +2 e2e (C4 Rel, sequence message); verified sequence Connect
  visually. 57 Playwright.
- Delete now works for *all six* families: the key handler dispatches selected node/edge removal to
  the right builder patcher (`deleteNode`/`deleteEdge`, C4 element/relation, sequence actor/message).
  C4 boundary deletion removes the whole block and relations to nested elements. +2 e2e (C4 boundary
  delete, sequence actor delete). 59 Playwright.
- Inline edge-label editing now reuses `@m/renderer`'s routed-polyline label anchor instead of the
  straight endpoint midpoint, so a bent-edge editor opens over the visible label position.
- Group outlines are now selectable: the app reuses the padded outline bounds for hit-testing and
  selects all leaf nodes under the clicked group, so Ungroup/Lock work from an outline click. +1 e2e.
- Group labels are editable sidecar metadata: double-clicking a group outline opens the inline
  editor, `setGroupLabel` updates the group, and overlay persistence stores the title. +1 e2e.
- Replaced the source `<textarea>` with **CodeMirror 6** (`src/editor.ts`). A small `Editor` interface
  (`value`/`setValue`/`insertAtCursor`/`cursor`/`select`/`focus`/`hasFocus`/`setError`) keeps the
  CodeMirror types out of `main.ts`, so every source read/write that used `srcEl.value` now goes
  through it. Highlighting is a stream tokenizer over the shared family keyword set with CSS-variable
  colours (so the light/dark switch drives them, no editor rebuild). The parser's `line:col` error is
  mirrored inline via `@codemirror/lint` (`setError` → a gutter marker + underline + hover message),
  complementing the click-to-locate status. Programmatic `setValue` (structural edits, examples,
  share-link) is annotated so it doesn't re-fire the render path; only user typing does. e2e drives
  the editor through a `window.__editor` handle + `e2e/support/source.ts` helpers (a contenteditable
  isn't a `<textarea>`, so `.fill()`/`toHaveValue()` don't apply). +2 e2e (inline error marker;
  highlight spans). 63 Playwright. Deps pinned in the catalog via `tools/pick-version.mjs`.
- Boy-scout: the shipped **C4 Examples entry didn't parse** — `Person(alice, "Alice", "A customer")`
  uses a 3-arg form the C4 grammar rejects (it accepts `Person(id, "label")`). The new inline error
  marker made it obvious. Corrected the example to the 2-arg form; noted the optional-description arg
  as a parser enhancement.
- Restored the C4 Examples entry to Mermaid's natural 3-arg form now that descriptions parse and
  render (`Person(alice, "Alice", "A customer")`, `Container(api, "API", "Handles requests")`).
- Added **undo/redo for canvas (overlay) actions** — drag, group/ungroup/lock, group label, and
  Regenerate. A small history of overlay snapshots (overrides + groups) is recorded just before each
  such mutation (a drag records once, on its first move); `⌘/Ctrl-Z` pops it and `⌘⇧Z`/`Ctrl-Y`
  redoes. It's gated on the editor not being focused, so CodeMirror keeps `⌘Z` for the source text —
  the layout/group history and the text history stay separate and don't fight. Editing the text (or
  loading an example) clears the overlay history, since the saved positions belong to the old
  diagram. Relax is intentionally excluded (it rebuilds the base scene, which the overlay snapshot
  doesn't capture). +2 e2e (drag undo+redo; group undo). Confirmed drag-to-move already works for
  every family (overrides are family-agnostic). 66 Playwright.
- Added **box-select (marquee)**: shift-drag on the empty canvas draws a dashed selection rectangle
  and, on release, adds every node it touches to the selection (intersection test, not full
  containment). Plain drag still pans, so nothing regresses; shift = additive is consistent with
  shift-click. Makes Group / multi-move / Delete over a cluster a single gesture instead of clicking
  each node. +1 e2e; footer hint added. 67 Playwright.
- Added canvas **keyboard affordances**: `⌘/Ctrl-A` selects all nodes, `Escape` deselects, and the
  arrow keys nudge the selection (Shift = a 10px step vs 1px) — fine positioning to complement coarse
  drag. A run of consecutive nudges shares one undo entry (a `nudging` flag records the pre-run
  overlay once, reset by any click/undo); locked groups don't move; a selected group's members nudge
  together (same expansion as drag). All gated on the editor not being focused, so CodeMirror keeps
  these keys for the source text. +2 e2e; footer hint updated. 69 Playwright.
- Added **Arrange** — align (left/center/right/top/middle/bottom) and distribute (horizontal/vertical)
  for the selection, via a small popover in the tools row (enabled on 2+ movable units; distribute on
  3+). Operates on *units*: a loose node or a whole top group, aligned by its bounding box so a group
  translates as one and keeps its internal layout; locked groups are excluded (like drag/nudge).
  Writes position overrides and is a single undo step. The popover opens upward (the toolbar is at the
  editor's bottom edge) and closes on outside-click / when the selection drops below 2. +2 e2e
  (align-left shares an edge; align undoes as one step). 71 Playwright.
- Added **node resize**: a single selected (unlocked) node shows corner handles; dragging one resizes
  it about the opposite corner via the new builder `resizeNode` (position + size override), with a min
  size and the connectors re-anchoring through `applyOverrides`. One undo step (recorded on the first
  move, like drag). Completes the direct-manipulation set (move / multi-select / align / resize). +1
  e2e (corner-drag grows the node, then one ⌘Z reverts). 72 Playwright.
- Added the **state diagram** family (`stateDiagram-v2`): parsed via `parseState`, laid out through
  the ELK path (a `stateToFlow` adapter in `@m/layout`), and rendered with the existing box/circle
  shapes — states are rounded boxes, `[*]` start/end are circles, transitions are arrowed labelled
  edges. Wired into the family dispatch (kind badge, source-map capture for relabel via
  `StateSource`, an Examples entry); Connect/Delete fall through to the generic `-->` / token
  removers, which match state syntax. +2 e2e (render; example parses). 74 Playwright.
