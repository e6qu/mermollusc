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
- State diagrams now support **composite states** (`state X { … }`): they render as container boxes
  wrapping their nested states (reusing the flowchart subgraph layout + container rendering), each
  composite scoping its own `[*]`. +1 e2e (composite renders without error). 75 Playwright.
- Fixed a crash on **empty / truncated source** (clearing the editor, or input ending mid-token like
  `A -->`): the parser's EOF error produced a NaN/out-of-bounds position, and the editor handed it to
  CodeMirror's lint as a diagnostic range → uncaught `lineAt` throw. `editor.setError` now clamps to a
  non-empty span strictly inside the document and marks nothing when there's nothing valid to mark
  (belt-and-suspenders with the parser fix). +1 e2e (clearing / truncated input never crashes). 76
  Playwright. Found via a per-family odd-input fuzz pass.
- Fixed stale sidecar groups: a group survived a text edit that removed its nodes (overrides are
  cleared on edit, groups weren't), so editing away and back could resurrect a phantom group onto
  reused ids. `renderFromText` now prunes groups to the live node set (via builder `pruneGroups`) on
  each successful parse. +1 e2e. 77 Playwright. Found via the robustness fuzz pass.
- Accessibility: the diagram `#stage` canvas (rendered pixels, opaque to screen readers) now carries
  `role="img"` + a dynamic `aria-label` — a successful render summarises kind, node/edge counts, and
  up to 24 node labels; a parse/layout error announces "Diagram error: …" (via `setStatus`). Audited
  that every visible button/select/link already has an accessible name. +2 e2e. 79 Playwright.
- Added the **ER diagram** family (`erDiagram`): parsed via `parseEr`, laid out through the ELK path
  (an `erToFlow` adapter in `@m/layout`), rendered with the existing box/edge shapes (cardinality
  shown textually in the relationship label). Two-way: relabel entity names + relationship verbs
  (`ErSource`), Connect (`connectEr` → `||--o{`), Delete (entity via the generic remover, relationship
  via `deleteErRel`). Examples entry + family dispatch wired. +2 e2e. 81 Playwright.
- ER rendered for real: crow's-foot cardinality end markers + entity attribute compartments now draw
  (renderer + layout work). Enriched the `er` example with attribute blocks (PK/UK/FK columns), added
  an ER pipeline golden, a `25-er` shots flow, and a third ER e2e (attribute block renders cleanly).
  Fixed the `make shots` instrument — its `setSource` still used `#src.fill()`, stale since the
  CodeMirror migration — to drive `window.__editor`. 82 Playwright green.
- Wired the **class diagram** family (the 9th): Examples entry + `<option>`, parse→source dispatch
  (`parseClassWithSource` → `classSource`), relabel (class names + relationship labels via
  `ClassSource`), Connect (`connectClass` → `-->`), Delete (`deleteClassRel`). Added a class pipeline
  golden, a `26-class` shots flow, and a class e2e (render + example). 84 Playwright green.
- Robustness/polish pass: edge labels now render on a background plate (renderer-led), so a label
  between two close nodes (e.g. an ER verb) stays legible instead of being crossed by the line +
  markers. No app code change beyond the canvas mock gaining `measureText`/`fillRect`.
- Polish pass 2: renderer now layers edges under nodes (so a straight link can't slice across an
  intervening box) — the pipeline goldens were regenerated to the new draw order. Fixed the last
  stale `#src.fill()` in the `make shots` instrument (the `10-parse-error` flow), so the full shot
  gallery regenerates again.
- Polish pass 3: added review shots for the newer families in non-default themes (`27-class-dark`,
  `28-er-sketch`) — confirmed compartments + UML/crow's-foot markers render correctly in dark and
  sketch. Drove a renderer fix so sketch-mode edge markers wobble with the edge.
- Wired the **requirement diagram** family (the 10th): Examples entry + `<option>`, parse→source
  dispatch (`parseRequirementWithSource` → `reqSource`), relabel (entity names only — verbs are
  keywords), Connect (`connectRequirement`), Delete (`deleteRequirementRel`). Added a requirement
  pipeline golden, a `29-requirement` shots flow, and a requirement e2e. 86 Playwright green.
- Class stereotypes (`<<interface>>`/`<<abstract>>`) now render as a `«…»` subtitle above the class
  name (parser + layout + renderer); enriched the `class` example + `26-class`/`27-class-dark` shots
  to show them. No app code change.
- Performance/scale pass. Profiled the pipeline at 200–600 nodes: parse ~3ms, display-list + paint
  ~0.1ms each, hit-test ~0.01ms — all negligible; ELK layout (~30–100ms) is the only heavy step and
  **already runs off the main thread** (`elk.bundled.js` inlines a Web Worker), so the UI isn't
  blocked by computation. Because layout is async, fast edits can have several renders in flight; added
  a `renderSeq` **latest-wins guard** so an out-of-order layout result can't paint over a newer
  diagram. Added `test/integration/scale.test.ts` — a 300-node flowchart through parse→layout→
  display-list→paint→hit-test as a scale regression guard.
- Ran an external code review (codex `gpt-5.5`, read-only) and recorded its prioritized backlog in
  `PLAN.md` (+ per-module `BUGS.md`, continuity note). Fixed the first P1: `removeNode` now dispatches
  ER/class/requirement deletes to the new family entity-delete helpers (whole `{ … }` block + incident
  relationships) instead of the line-based `deleteNode` that orphaned bodies. +1 e2e (delete a
  brace-bodied ER entity → block gone, ORDER stays, source still parses).
- Fixed external-review P1 (unhandled icon-decode rejection): `ensureIcons` catches per-icon
  `img.decode()` failures (invalid pack SVG), logs loudly, skips the glyph, and returns the failed
  keys; `renderFromText` surfaces them in the status bar. The render no longer aborts on an unhandled
  rejection — the diagram always paints (glyph-less for the bad icon).
- Fixed external-review P1 (negative-coordinate clipping): `paintScene`, `scenePoint` (pointer→scene),
  the minimap, and the SVG export now offset by the displayed extent origin, so a node dragged past
  the top-left stays visible, hit-testable, and exportable. The offset is (0,0) unless something is
  dragged negative, so the common path is unchanged (87 Playwright still green).
- Fixed external-review P2 (goldens omit state): added flat `state` + `state-composite` samples to the
  pipeline goldens so composite / `[*]` pseudo-state geometry regressions are caught.
- Fixed external-review P2 (inline editor ignored `viewScale`): `openInlineEditor` now maps the
  scene-space anchor to screen exactly as the canvas paints (offset by extent origin, scaled by
  `viewScale`), so the overlay lands on its target after a zoom/Fit. +1 zoom e2e.
- Fixed external-review P2 (requirement verb labels not editable): the inline-editor dispatch now edits
  a requirement relationship's verb (parser captures the verb span in `ReqSource.relationships`), so
  the "double-click any label" claim holds for requirement too.
- Wired the **gitGraph** family end-to-end: imported `parseGitGraphWithSource` + `GitGraphSource`,
  added a `gitSource` var, a "Git graph" Examples entry (+`index.html` option), the `renderFromText`
  source-map case, and an inline-relabel branch (explicit commit ids only; branch heads / auto-id
  commits carry no span). gitGraph is render + inline relabel — the flowchart-only Add/Connect/Delete
  controls stay disabled for it. +1 golden sample, +3 e2e specs (render, example loads, malformed merge
  surfaces a lint error).
- Wired the **timeline** family end-to-end: imported `parseTimelineWithSource` + `TimelineSource`, added
  a `timelineSource` var, a "Timeline" Examples entry (+`index.html` option), the `renderFromText`
  source-map case, and an inline-relabel branch (periods + events editable; section bands and the spine
  carry no span). +1 golden sample, +3 e2e specs (render, example loads, orphan-continuation lint).
- Wired the **mindmap** family end-to-end: imported `parseMindmapWithSource` + `MindmapSource`, added a
  `mindmapSource` var, a "Mindmap" Examples entry (+`index.html` option), the `renderFromText`
  source-map case, and an inline-relabel branch (node labels editable). +1 golden sample, +2 e2e specs.
- Wired the **pie** family: a "Pie" Examples entry (+`index.html` option). Pie renders through the
  generic `parseDiagram` + `layoutDiagram` path (wedges need no per-family source-map); it's render-only
  (a chart — wedges aren't hit-testable nodes), so there's no relabel/drag wiring. +1 golden, +3 e2e
  (render, example loads, non-positive value lints). The golden `normalize` learned the `wedge` cmd.
- Wired **DOT import**: a "DOT (Graphviz)" Examples entry (+`index.html` option). DOT text is imported
  to a flowchart by `parseDiagram`, so it renders through the generic path and the kind badge reads
  "flowchart". +3 e2e (render, example loads, malformed edge lints), +1 pipeline golden.
- Wired **DOT export**: a **DOT** toolbar button downloads `mermollusc.dot` via `toDot(applyOverrides(
  scene, overrides))` (the displayed scene, so a dragged layout exports as positioned). +1 e2e (the
  download fires with the right filename) and an export↔import **round-trip** integration test
  (flowchart + DOT + a non-flowchart ER family all survive Scene → DOT → `parseDot`).
- Let the top-bar actions **wrap** (`flex-wrap`) instead of overflowing the viewport: adding the DOT
  export button pushed the single-row toolbar past 1280px, sending Share/Load-icons off-screen (and
  destabilising zoom-centred e2e). Controls now reflow to a second right-aligned row at narrow widths.
- DOT export now carries the diagram's direction: `renderFromText` tracks `lastDirection` (the parsed
  AST's `direction`, when it has one) and passes it to `toDot`, so an exported flowchart/DOT keeps its
  `rankdir`. The round-trip integration test threads direction through too.
- The DOT example now includes a `subgraph cluster_core { … }` so the imported cluster shows as a
  labelled container box (DOT clusters → `FlowSubgraph` → ELK container). Verified by screenshot.
- Audit-sweep fixes: Delete/Backspace no longer hijacks a focused text field (icon-filter / inline
  rename) to delete canvas nodes; a **missing icon** keeps the `ok` status + counts (warning appended)
  instead of an `error` that greyed out the correctly-rendered canvas; the **inline rename overlay**
  repositions on stage scroll/resize (was pinned to one-time viewport coords) and stops Enter/Escape
  from also clearing the selection; **PNG/PDF export** re-paints at a fixed device scale (zoom-
  independent, crisp, chrome-free) instead of copying the zoomed live canvas. +2 e2e; +6 "renders X"
  e2e hardened (assert `#kind` + no parse-error, not just a non-zero canvas).
- Perf: pointer-move repaints (drag/resize/marquee) are coalesced to one paint per animation frame via
  `requestPaint` (rAF) — a burst of pointer events no longer rebuilds the display list + repaints the
  canvas + minimap each time. One-shot paints still call `paintScene` directly.
- Collaborative editor **Phase 0 — the document-model seam** (no infra). Extracted the sidecar
  overlay (manual node positions/sizes + element groups + groupSeq + undo/redo history + persistence)
  out of `main.ts`'s module-level state into an `OverlayDoc` interface (`src/document-model.ts`);
  `createLocalDocument` is the single-user implementation, holding the state in closure vars and
  writing through an injected `save` sink (localStorage today). `main.ts` now reads the overlay via
  `doc.overrides()`/`doc.groups()` and mutates it via `doc.moveNode`/`resizeNode`/`groupNodes`/
  `ungroupAt`/`setGroupLocked`/`setGroupLabel`/`pruneGroupsTo`/`clearOverrides`/`replace`, with
  `record`/`undo`/`redo`/`clearHistory`/`persist` for history + save. Pure, behavior-neutral refactor
  (typecheck + lint + format clean; all 105 Playwright specs green; launch screenshot verified). The
  seam mirrors the existing `Editor` seam for source text, and is the plug-in point for a future
  Yjs-backed CRDT implementation (the `save` sink becomes a broadcast) — no call sites change. Full
  phased plan recorded in `docs/collab-editor-plan.md` and the root `PLAN.md` Future bets (Phase 0
  done; Phases 1–3 + 5 decision points pending sign-off).
- Collaborative editor **Phase 1 (Yjs CRDT, in-memory)**. Moved the `OverlayDoc` interface into
  `@m/contracts` (shared port) and added `@m/collab` — a Yjs-backed `createCollabSession` whose
  `overlay` implements `OverlayDoc` (and a `Y.Text` source channel + binary-sync seam). The app now
  depends on `@m/collab` and constructs the Yjs overlay behind a default-off `?collab` URL flag — same
  interface, so no call site changed; with no peer it behaves like the local document, proving the CRDT
  document drives the real app. DAG updated to `builder <- collab <- app` (Makefile, AGENTS §4, PLAN).
- Collab Phase 1 **dev WebSocket transport**. The `?collab` flag now connects the Yjs session to the
  dev relay (`@m/collab`'s `connectWebSocket` → `dev-server.mjs`) and repaints on remote overlay
  changes; two tabs on `?collab&room=…` edit the overlay live. `?room=`/`?ws=` override the room/relay
  (default relay on port 1234; the scheme follows the page — secure on https, plain only for local
  dev). Added a `window.__collabOverrideCount` e2e hook + two Playwright
  specs (single-tab Yjs path, two-tab convergence) with the relay as a second Playwright webServer
  (TCP-port wait). In collab mode the shared room owns the overlay, so the persisted localStorage
  overlay is not restored.
- Collab Phase 1 **live source binding**. The `?collab` editor now binds to the session's source
  `Y.Text` via `collabSession.sourceBinding()` (y-codemirror.next), so two tabs share the diagram TEXT
  live (character merge, per-user text undo) — each re-deriving its diagram locally. `createEditor`
  gained an `extra` extensions hook + a `textHistory` flag (collab drops CodeMirror's own history so
  Yjs owns ⌘Z); collab mode starts the editor empty, seeds the room if empty after sync, and no longer
  clears the shared overlay on a text edit (stale overrides are inert). New Playwright spec: edit in
  tab A → tab B's editor + canvas follow.
- Collab Phase 1 **presence**. On `?collab` the app labels the client via `session.setLocalUser`
  (random name + colour); the source binding tracks the local cursor into the session's awareness, so
  remote carets/selections render in peers' editors (document + presence ride one socket as distinct
  frames). New Playwright spec: a remote cursor from tab A shows in tab B. Phase 1 (CRDT + transport +
  source binding + presence) is feature-complete.
- Collab Phase 2 start (persistence). The optional relay moved to `modules/collab/server/relay.mjs`
  with a pluggable `RoomStore` (rooms survive restart via `PERSIST_DIR`); the Playwright webServer +
  `make collab-server` point at the new path. No app behaviour change — single-user local still needs
  no server, and the `?collab` path is unchanged.
- Collab Phase 2 — forward a `?token=` to the relay (an Auth0 access token, once login is wired); the
  relay verifies it when auth is enabled. Absent in local dev → the relay's default allow-all accepts,
  so single-user and the `?collab` flow are unchanged.
- Collab Phase 2 — role-aware UI. The relay sends the granted role (a control frame); the app applies
  it via `connectWebSocket`'s `onControl`. A viewer's editor goes read-only (new `editor.setReadOnly`)
  and the canvas mutations (drag/resize/delete/nudge/rename) are guarded by a `viewerMode` flag, with
  the editing tools dimmed (`body[data-role="viewer"]`) and a "view only" badge in the source header;
  editor/owner restore editing. A `__collabSetRole` e2e hook + spec cover it.
- Audit fix: closed the viewer read-only holes. `viewerMode` now guards every mutation entry point — the
  Examples dropdown, the icon picker, Add/Connect/Relax/Regenerate/Group/Ungroup/Lock/Arrange handlers,
  and the canvas drag/resize/delete/nudge/rename — not just the CSS dim (which `editable:false` and
  pointer-events couldn't fully enforce, since programmatic/keyboard paths bypass them). A dropped relay
  is now surfaced (a status line + console error) via the transport `onClose` hook. The role e2e now
  attempts a viewer write and asserts it's rejected (no override, source unchanged), then that an editor
  can.
- Polish pass (audit follow-up). Strengthened the weak "renders X" e2e specs: a shared
  `watchPipelineErrors` helper now captures layout/relax failures (not just parse) so a layout
  regression can't slip through with the old diagram on screen, and the three flowchart-kind specs
  (subgraph/shapes/dot) assert the new diagram's `aria-label` content — they can no longer pass on the
  lingering default flowchart sample.
- Performance deep-dive. Benchmarked the on-thread pipeline (parse → layout-transform → display-list →
  overlay → hit-test) at 200–8000 nodes: all fast and roughly linear (parse ~36ms @ 8000 nodes; the
  post-ELK decode + toScene ~5ms @ 2000; toDisplayList/applyOverrides/hitTest sub-ms). The heavy ELK
  layout runs off the main thread (worker), so there's no main-thread layout block. The one real
  per-interaction cost found: the minimap redrew **every node + edge on every scroll event**
  (`scroll → drawMinimap`, O(node count)). Fixed by caching the static minimap content (background +
  edges + node blocks) to an offscreen canvas, rebuilt only on a scene/theme change; a scroll now blits
  the cache + redraws the cheap viewport scrim — O(1) per scroll regardless of diagram size. Pan/zoom/
  theme e2e cover the path; screenshot-verified.
- Editing/export UX: a **Copy** button that puts the rendered diagram on the clipboard as a PNG (the
  same zoom-independent, chrome-free composite the PNG export uses) — paste straight into a doc/chat/
  issue, no download. Best-effort (needs a secure context + clipboard-write permission); the outcome is
  always surfaced to the status bar, with a graceful fallback message where image-clipboard isn't
  supported, never silently dropped. +1 e2e (grants clipboard permissions, copies, and asserts an
  image/png item actually landed on the clipboard).
- Editing UX: a **keyboard & mouse shortcut reference** — a "?" toolbar button (and the `?` key) opens
  a centered modal listing the shortcuts grouped by Select / Edit / Layout & groups / View, so the rich
  editing toolkit (marquee, nudge, ⌘A, group/lock, undo/redo, ⌘-wheel zoom…) is discoverable instead of
  only terse status-bar hints. Closes on ✕ / Escape / backdrop click; the Escape handler is capture-
  phase so closing the panel doesn't also clear the canvas selection. +1 e2e (open via button + key,
  close via all three).
- Editing UX: **duplicate selected node(s)** (⌘D, flowchart). Appends a fresh-id copy of each selected
  node (same label + shape) to the source, and — after the re-layout — pins each copy just off its
  original via a position override and selects the copies, so the duplicate lands next to the original
  ready to move/connect (edges aren't copied; loose like Add node). Overrides the browser ⌘D; added to
  the shortcut overlay. +1 e2e (select → ⌘D → 5th node, label duplicated, one override).
- Editing UX: **drag-to-connect** (⌥-drag). Holding Option and dragging from a node draws a dashed
  rubber-band to the cursor; releasing over another node creates an edge between them in the family's
  own syntax (reuses `appendEdge`, so it works wherever the Connect button does — flowchart, network,
  C4, sequence, …), no select-two-then-Connect dance. Releasing on empty space / the same node cancels.
  Viewers can't connect. Added to the shortcut overlay. +2 e2e (drag creates an edge; empty-space drag
  doesn't); rubber-band screenshot-verified.
- Editing UX: **alignment snapping** while dragging a single node. At drag start the other nodes'
  edge/centre lines (left/centre/right xs, top/middle/bottom ys) are captured; each pointer-move snaps
  the dragged node's nearest edge to a candidate line within ~6px and draws an amber dashed guide on
  the snapped axis (cleared on release). Multi-node drags don't snap. +1 e2e (a 3px drag snaps to the
  spine centre; a far drag doesn't; guide clears on release); screenshot-verified the guide line.
- Editing UX: **resize snapping** — a corner-handle resize reuses the same alignment machinery. The
  candidate lines are captured at resize start (factored into a shared `snapCandidates` helper, used by
  both drag and resize); each move snaps the *moving corner* to the nearest line within ~6px and draws
  the amber guide. The guide is derived from the corner's *final* position, so the min-size clamp drops
  it when the box can't actually grow/shrink onto the line — no lying guide. +1 e2e (nudge the corner a
  few px → snaps to the shared right-edge line; big drag → no snap; clears on release); the guide line
  through the diagram was screenshot-verified.
- Polish/harden: **Delete of a composite `state X { … }`** now routes to the builder's body-aware
  `deleteStateEntity` instead of the line-based `deleteNode`, which had orphaned the block body +
  closing `}` and corrupted the source (the last open piece of the brace-bodied-delete P1; ER/class/
  requirement were already fixed). +1 e2e (select the composite container's title strip, Delete → its
  whole block is gone, a sibling state survives, the source still parses with no lint marker).
- Type-system hardening (make bug *classes* unrepresentable):
  - **Exhaustive family dispatch.** `removeNode`/`removeEdge`/`appendEdge` and the render source-capture
    switch list every `DiagramAst["kind"]` explicitly and end in `assertNever`. The generic line-based
    handlers (flowchart/block/network/cloud/gitGraph/timeline/mindmap/pie) are now named arms, not a
    `default:` catch-all — so a new family is a **compile error** instead of being silently misrouted to
    flowchart syntax (the exact shape of the composite-state-delete bug, now prevented as a class).
  - **No silent error-drops.** The 13 `isOk(withSource) ? withSource.value.source : null` lines in the
    render path became one `match`-based `captureSource` helper that **logs** when a re-parse disagrees
    instead of silently nulling the source map — removing a direct violation of the no-silent-fallback rule.
  - **Single scene↔screen transform.** `scenePoint` (screen→scene) and the new `sceneToScreen`
    (scene→screen) are kept together as one inverse pair; the inline editor's `place()` routes through
    `sceneToScreen` instead of re-deriving the arithmetic inline. A copied derivation that dropped
    `* viewScale` is what shipped the inline-editor-drift bug twice; there's now one tested place.
- Polish/harden: closed the "renders X" e2e test-confidence gap. Every family render spec (15 files)
  now captures pipeline errors through the shared `watchPipelineErrors` helper — which sees
  `parse`/`layout`/`relax failed` **and** page errors, so a layout/relax regression that returns early
  (leaving the previous diagram on screen) can no longer slip past a parse-only filter. Each also
  asserts the canvas `aria-label` starts with its own `"<kind> diagram:"` (flowchart/C4 specs name a
  specific parsed node), so a stale render of the default flowchart fails the assertion. Net −71 lines
  of duplicated boilerplate; 118 e2e specs green.
- Type-system hardening: dropped the `e.waypoints.length < 2` guard in the inline-editor edge-anchor
  path now that `SceneEdge.waypoints` is `TwoOrMore<Point>` (always anchorable).
- Editing UX: **change node shape** (the `S` key) — cycles the selected flowchart node(s) through
  rect → round → stadium → circle → diamond, rewriting each node's bracket syntax in the source via
  the builder's `reshapeNode` and keeping the label. Multi-select cycles each node, applying the
  rewrites back-to-front so earlier edits don't shift later offsets. A focused text field keeps the
  key (the no-modifier handler now also bails on input/textarea focus). Added to the shortcut overlay.
  +1 e2e (`S` cycles A `[Start]`→`(Start)`→`([Start])`, B untouched); screenshot-verified the diamond.
- Editing UX: **Connect chains 3+ selected nodes** (A→B→C) in click order — one edge per consecutive
  pair, built in a single action via the per-family `appendEdge` (so it works across every family, not
  just flowchart). Two selected still makes a single edge (the common case). +1 e2e (⌘A-select three
  loose nodes → Connect → both `A --> B` and `B --> C` appended in order).
- Editing UX: **⌘C / ⌘V copy-paste** of flowchart node(s). ⌘C captures the selected nodes' label +
  shape and their offsets from the selection's top-left into an in-memory clipboard (persists across
  edits); ⌘V pastes fresh-id copies — keeping the arrangement, cascading each successive paste so they
  don't stack, and selecting the result. Complements ⌘D (duplicate) with a reusable clipboard. With
  nothing selected / off-flowchart the keys fall through to the browser. Added to the shortcut overlay.
  +1 e2e (copy → paste → 5th node; second paste → 6th; clipboard persists). Screenshot-verified.
- Type-system hardening: **scene vs screen coordinate spaces are now distinct types.** `sceneToScreen`
  returns a `ScreenPoint` (not a scene `Point`), so its result can't be fed into a scene API
  (`moveNode`/`hitTest`/…) without an obvious reconversion — feeding a screen-converted point into scene
  math is now a compile error. DOM-overlay placement goes through a typed `positionOverlay(el, at:
  ScreenPoint)` seam (so a scene point can't position an element), and the pan gesture's `startX`/`startY`
  are `ScreenCoord` (minted from `clientX/Y`). Complements the single-`sceneToScreen` consolidation that
  fixed the original drift bug — branding adds boundary protection that arithmetic-only checks couldn't.
- Robustness (perf track): **Arrange** (align/center) computed its extent via `Math.min(...lefts)` /
  `Math.max(...rights)`, whose argument spread throws once the selection is large enough — a select-all
  (⌘A) then align on a big diagram would `RangeError`. Replaced with fold-based `minOf`/`maxOf`, the
  same convention the gitgraph/pie layouts already use.
