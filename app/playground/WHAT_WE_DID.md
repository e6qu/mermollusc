# @m/app (playground) — work log


## 2026-07-11 — review-omnibus: user-journey + UX + security sweep (app side)

A multi-agent review of every user journey, plus backend/security/fake-functionality audits. The app's
share of the fixes:

- **Error & empty-state journeys.** A parse error no longer strands the floating selection context bar
  over the dimmed stale render (it hides with the selection until the render is valid again). Emptying
  the source is now a fresh start, not a failure: the scene/selection drop, the stage shows the
  recovery empty box, and the status reads "nothing to render — type a diagram or load an example"
  instead of the CodeMirror lexer's "Expecting token …". New `e2e/stale-ux.spec.ts`.
- **Collab join flash + seed deadlock.** Collab boot now paints nothing under a "joining the shared
  room" status until the first `Y.Text` sync lands (which renders + auto-fits), instead of flashing the
  local/sample diagram for ~300ms. A relay that never answers (reconnect backoff exhausted) clears the
  seed gate so the editor can't stay permanently blank while the banner claims "editing locally".
- **Typed CONTROL + role hardening.** The transport now hands `main.ts` a closed union (`role`/`seed`);
  the role is re-checked against `owner|editor|viewer` before it reaches the DOM/badge, and the new
  `rejected` reconnect status (a 1008/1009 policy close) gets its own banner instead of the generic
  disconnect message. Transport boundary failures log through `consoleLogger`.
- **Overlay visual-style sync.** Node colour accents and per-edge route styles travel through the
  shared Yjs overlay in collab rooms now (they were session-local, so peers never saw a restyle);
  single-user localStorage persistence is unchanged.
- **Mobile.** Phone-width first visit starts with the source panel + minimap collapsed so the diagram
  is on screen; the context bar is a fixed bottom sheet on the visual viewport; the zoom cluster no
  longer overflows the stage edge (a `.toolbar-group` full-width stretch meant for the topbar was
  also catching the stage-pinned zoom group — now scoped to `.topbar-actions`); touch hides the
  keyboard hint row; the "hide HUD/minimap when the sheet is open" CSS actually matches now (`:has()`).
- **CSP.** `connect-src` is generated per build in `vite.config.ts` — Auth0 origin only when
  configured, `VITE_RELAY_ORIGINS` for explicit deploy relays, no blanket `https:`, and no `wss:` in
  the backend-free Pages demo. Dev mode stays permissive.
- **Honesty/polish.** Killed the "Relax: flowchart only" task lie (Relax is enabled for 9 families);
  pie/gantt status counts say "slices"/"tasks · links"; icon-picker glyphs show their names; dark-mode
  context swatches use distinguishable mid-tone hues; the task HUD wraps instead of ellipsizing; the
  help dialog gained the navigator's `d` + Home/End rows and an Alt+Arrow canvas-vs-navigator note.
- **Docs.** README (Connect/Add/Relax/Regenerate breadth, arbitrary class stereotypes, DAG now shows
  collab + relay), PLAN.md + docs/collab-editor-plan.md (Go relay + Auth0 finalised), the site landing
  preview (draws the `Edit` node its own source snippet declares), and this module's STATUS/DO_NEXT.
  Display-list goldens refreshed for the layout scene changes (titles, gitGraph tags/ids, milestone
  diamonds, decollided labels).


## 2026-07-05 — Undo/Redo toolbar buttons + relax tuning

- Added visible **Undo / Redo** toolbar buttons (were keyboard-only). They mirror the real history:
  disabled when there's nothing to undo/redo (driven from `paintScene` via new `OverlayDoc.canUndo()/
  canRedo()`, so they never drift), enabled after an edit, and disabled for a collab viewer. e2e added.
- **Relax feel**: it now auto-fits the view after a relax (was leaving you scrolled to an empty corner).
  See `@m/layout` for the force-sim tuning (gravity + repulsion cutoff) that stops the canvas ballooning.

## 2026-07-05 — Edge control points expand the viewport

- Dragging an edge bend point past the sheet edge now expands the canvas/viewport (via the builder's
  `growExtentToContent` in `applyStyles`), matching node-drag behaviour. e2e added.

## 2026-07-05 — Relax for all graph families + pinning

- "Relax" now force-directed-rearranges EVERY node-graph family (flowchart/state/er/class/block/network/
  cloud/c4/mindmap), via the pure `relaxScene` — was flowchart-only. Moves are written as UNPINNED
  position overrides (so Relax is re-runnable; Reset positions reverts).
- New PIN control (context-bar "Pin"/"Unpin" toggle + an amber pin badge on pinned nodes): a pinned node
  is held fixed by Relax (the force sim works around it) and kept by Regenerate. Reuses the override
  `pinned` flag.

## 2026-07-05 — Mindmap node colour to source (write-side 9/9 complete)

- Mindmap node colour now writes to the SOURCE: an inline `:::<accent>` on the node's line plus a
  `classDef <accent> fill:…` (added once), via `setMindmapNodeColourInSource`. Every diagram family now
  colours nodes source-canonically. (Mindmap has no edges, so no edge-colour work.)

## 2026-07-05 — C4 node colour to source + swatch reads source for all families

- C4 element colour now writes `UpdateElementStyle(id, $bgColor="…")` into the SOURCE (dedicated
  `setC4NodeColourInSource`), so the last mainstream family is source-canonical for node colour.
- Fixed a latent UI-sync bug: `nodeSwatchAccent`/`edgeSwatchAccent` only read the SOURCE colour for
  flowchart, so state/er/block/network/cloud/class (migrated in #278–#280) showed the swatch as "none"
  on reselect. Both now read the source-resolved colour for any family with `styles`, falling to the
  overlay only when the source has none (e.g. an overlay-coloured mindmap).

## 2026-07-05 — Flag non-Mermaid diagrams in the UI

- A `non-Mermaid` badge (amber, in the source header next to the kind badge) now marks diagrams whose
  syntax isn't Mermaid — our custom `network`/`cloud` families and a Graphviz DOT import (`isDotImport`)
  — so users don't assume the source round-trips to real Mermaid. Tooltip/aria-label name the dialect.

## 2026-07-05 — Write edge colour to source for the non-flowchart families

- `setEdgeColour` now writes `linkStyle <index> stroke:…` into the SOURCE for state/er/block/network/
  cloud/class too (generalized `setEdgeColourInSource` + `edgeDeclList`/`edgeLinkStyleSpanFor`). Only
  c4 (rels not in the shared linkStyle model) and mindmap (no edges) keep the overlay edge accent.

## 2026-07-05 — Write node colour to source for ER/block/network/cloud/class

- `setNodeColour` now writes `style <id> fill:…` into the SOURCE for ER/block/network/cloud/class too
  (via `nodeStyleSpanFor` + `SOURCE_COLOUR_FAMILIES`). Only c4 and mindmap remain on the overlay accent.

## 2026-07-05 — Write state node colour to the source

- `setNodeColour` now writes a `style <id> fill:…` directive into the SOURCE for state diagrams too (not
  just flowchart), via a family-dispatched `nodeStyleSpanFor` + generalized `setNodeColourInSource`
  (update-in-place / append / remove). Families without style-span capture yet still use the overlay.

## 2026-07-05 — Render C4 element colours from the source

- `sourceNodeColors` now also colours C4 elements (scene ids equal element ids). C4 relationship colours
  (`UpdateRelStyle`) aren't in the shared edge model, so no edge colouring.

## 2026-07-05 — Render class-diagram colours from the source

- `sourceNodeColors`/`sourceEdgeColors` now also colour class diagrams (scene ids equal class ids;
  `linkStyle` indexes the relationships).

## 2026-07-05 — Render mindmap colours from the source

- `sourceNodeColors` now also colours mindmap nodes (keyed by generated node id; mindmap has no edge list,
  so no `linkStyle` edge colouring).

## 2026-07-05 — Render cloud-diagram colours from the source

- `sourceNodeColors`/`sourceEdgeColors` now also colour cloud diagrams (scene ids equal node ids;
  `linkStyle` indexes the links).

## 2026-07-05 — Render network-diagram colours from the source

- `sourceNodeColors`/`sourceEdgeColors` now also colour network diagrams (scene ids equal node ids;
  `linkStyle` indexes the links).

## 2026-07-04 — Render block-diagram colours from the source

- `sourceNodeColors`/`sourceEdgeColors` now also colour block-beta diagrams (blocks carry the same style
  directives; scene ids equal block ids, `linkStyle` indexes the block edges).

## 2026-07-04 — Render ER-diagram colours from the source

- `sourceNodeColors`/`sourceEdgeColors` now also colour ER diagrams (entities carry the same style
  directives; scene ids equal entity ids, `linkStyle` indexes the relationships).

## 2026-07-04 — Pasting a whole diagram replaces + switches type

- Pasting a WHOLE Mermaid diagram (its first line is a diagram header, via `looksLikeDiagramHeader`)
  now REPLACES the entire editor document, so the renderer autodetects and switches to the pasted
  diagram's type instead of appending into the current one. A partial snippet (no header) still inserts
  at the cursor. Handles fenced ```mermaid blocks too.

## 2026-07-04 — Render state-diagram colours from the source

- `sourceNodeColors`/`sourceEdgeColors` now also colour STATE diagrams (they carry the same Mermaid
  style directives, and their scene ids equal the source ids). First "other family" for source-canonical
  colour; the write side (spans/editor) stays flowchart-only for now.

## 2026-07-04 — Render `:::class` node colours

- A pasted flowchart using the inline `:::class` shorthand now colours its nodes (it flows through the
  same source-node-colour path as `class`/`classDef`).

## 2026-07-04 — Honour `classDef default` / `linkStyle default`

- `sourceNodeColors`/`sourceEdgeColors` now apply a `classDef default`/`linkStyle default` as the base
  colour for every flowchart node/edge, with an explicit `style`/`class`/`linkStyle <index>` overriding
  per property. Previously these directives parsed but rendered nothing (a Mermaid-compliance gap).

## 2026-07-04 — Editor review fixes (boyscout)

- Edge reconnection: declines loudly (no source rewrite) when the endpoint is released back onto its OWN
  node — which for a bracketed `B[Label]` would have silently dropped the label — and when the target is
  a subgraph container; a no-op now flashes a status.
- Clearing a node/edge colour that comes from a `classDef`/`class` or a shared multi-target `style`/
  `linkStyle` line (no editable single-target span) now warns loudly ("edit the source") instead of a
  silent "made no change" while the element stays coloured.
- Removed an `any` leak: the overlay-save identity stamp parses to `unknown` and builds a typed object.

## 2026-07-04 — Drag-to-reconnect edge endpoints (flowchart)

- A selected flowchart edge shows draggable ENDPOINT handles (hollow squares at each end); dragging one
  onto another node rewrites that endpoint in the SOURCE (`reconnectEdgeEnd`), source-canonical. A chained
  endpoint (shared token in `A --> B --> C`) is declined loudly rather than silently moving both edges.
  Gesture mirrors the connect/bend-drag (rubber-band from the fixed end; reconnect on release over a node).

## 2026-07-04 — Grouping writes a subgraph to the source (flowchart)

- The Group button now wraps selected flowchart nodes in a Mermaid `subgraph … end` block in the SOURCE
  (source-canonical), like cloud's `group{}`. Ungroup deletes the block, detecting a selected subgraph
  container OR a selected member node. Non-flowchart families keep the overlay group.

## 2026-07-04 — Edge colour swatch writes to the source (flowchart)

- The colour swatch now writes a flowchart edge's colour into the SOURCE as a `linkStyle <index>
  stroke:<hex>` directive (edges targeted by declaration index), add/update-in-place/remove, and reflects
  it by reverse-mapping the stroke hex to an accent. Rendering threads a source-derived edge-colour map to
  `toDisplayList` (canvas + exports). Non-flowchart families keep the overlay `EdgeStyle.accent`.

## 2026-07-04 — Node colour swatch writes to the source (flowchart)

- The context-bar colour swatch now writes a flowchart node's colour into the SOURCE as a `style <id>
  fill:<hex>` directive (add/update in place/remove), instead of the overlay — source-canonical styling.
  Multi-node edits apply in-place patches by descending offset (so spans stay valid), then append. The
  swatch REFLECTS the source colour by reverse-mapping the fill hex to an accent. Non-flowchart families
  keep the overlay accent (their dialects have no `style` syntax we parse — the overlay is additive, not
  a fallback).

## 2026-07-04 — Render node colours from the Mermaid source

- A flowchart's `style`/`classDef` directives now COLOUR the nodes (canvas + every export): `main.ts`
  resolves them via `@m/parser`'s `resolveNodeStyles` into a scene-node-id→colour map passed to
  `toDisplayList` and the exporters. Faithful raw colours (no accent snap). The overlay colour swatch is
  untouched for now — routing it to WRITE `style` directives is the next step.
## 2026-07-04 — Miro-style edge colour UI

- The context-bar swatch picker now serves edges too: selecting an edge (only edges) shows the same nine
  swatches, relabelled "Edge color", reflecting/among setting the edge's stroke accent via a new
  `setEdgeColour` (preserves route/waypoints; drops the style when it returns to a clean default). A new
  `__edgeAccent` e2e hook mirrors `__nodeAccent`.

## 2026-07-03 — Paste-any-Mermaid: fenced-block unwrap + autodetect/sync verified

- A pasted fenced code block (```mermaid … ```, the usual copy shape from Markdown/GitHub/chat) now
  UNWRAPS on paste (new pure `unwrapMermaidFence` + a CodeMirror paste `domEventHandler` in editor.ts),
  so the real diagram header reaches autodetection instead of reading as an unknown → flowchart. Only a
  single whole fenced block (bare ``` or ```mermaid) unwraps; ```python etc. paste as-is.
- Verified (and locked with `paste-autodetect` e2e) that the rest already works end to end: autodetect
  across all eight families, the example select drops to its placeholder, the previous diagram's overlay
  overrides are pruned (don't linger on a pasted different diagram), and the style select repopulates for
  the new family — with no page errors. Same editor drives the demo + main views.

## 2026-07-03 — Full node colour palette in the swatch picker

- The context-bar swatch picker now surfaces ALL nine node accents (added compute/data/network/
  security/ops next to none/muted/active/danger) — the plumbing (`setNodeColour`, `NODE_ACCENTS`,
  the generic swatch reflect/keyboard logic) already supported them; only the four generic swatches
  were in the HTML. Swatch fills mirror the renderer's `accentFill` light palette (with dark-theme
  variants). Node-colour e2e extended to assert all nine + an architecture accent applying.

## 2026-07-03 — Miro-style edge control points

- A selected edge now shows draggable BEND HANDLES (filled dots) at each interior control point plus a
  small hollow ADD-DOT at each segment midpoint. Drag a handle to move a bend; click/drag an add-dot to
  insert a new control point; double-click a handle to remove it (Miro's white-bullet reset), auto-
  routing again once all are gone. Manual bends are stored in the overlay (`EdgeStyle.waypoints`), so
  they persist, share-link, collab-sync, and export like every other overlay edit; the route-style
  (Square/Straight/Curved) still renders the segments between them. New `edge-control-points` e2e.

## 2026-07-03 — Box-family edges reroute around nodes they crossed/hugged

- shownScene runs the new `rerouteBoxEdges` (after its trunk/bus re-route, before the border pass) for
  the box families, so a connector that the trunk router sent THROUGH a node or ALONG a border is
  maze-routed to a cleaner mount pair when one is strictly better on screen. Cloud's dense wiring drops
  from 8 crossings/hugs to 4; the four-family total 22→18. New e2e asserts the total stays at/under 20.
## 2026-07-03 — Edges no longer run along node/container borders

- The trunk router placed channel legs at coordinates that coincided with node/group borders, so the
  edge line merged into the box outline (obstacle avoidance can't catch a tangent). shownScene now runs
  the new `separateEdgesFromBorders` pass after its re-route (before decollision), matching layout. The
  cloud diagram went from 6 border-hugging legs to 0.
## 2026-07-03 — Edge labels no longer struck through (orientation-aware)

- The earlier off-line nudge was silently dropped by shownScene's per-render re-routing (which resets
  labelPos to the line midpoint). Moved the label-vs-line treatment to the renderer (draw time) where
  nothing can drop it, and made it orientation-aware per the user: horizontal edge labels lift above
  the line (transparent); vertical edge labels stay in-channel on a small opaque masking plate (less
  horizontal space than dodging aside). shownScene re-runs decollision after re-routing so labels stay
  off nodes.
## 2026-07-03 — Edge-mount quality: centre mounts, off-line labels, rounded classic edges

- Reproduced each report with screenshots, fixed, re-verified. Box families attach edges at side-centre
  mounts (no border-sliding, no corner attachment); classic flowchart edges are rounded-corner
  orthogonal (no spline swoops); edge labels sit beside their line (perpendicular nudge, transparent
  background kept); mount-point indicators bumped larger on selection; C4 given more room. New
  family-regression e2e asserts box-family endpoints land on side centres.
## 2026-07-03 — Ghost labels, always-on minimap, clickable in-group edges, wider lanes

- Edge labels are bare 75%-alpha text with no plate (user direction; renderer). Trunk/bus/de-stacked
  lanes separate at 14px (was 8), with the channel reservation and trunk offsets rescaled to match.
- The minimap is an always-available overview now (it used to appear only on overflow, which
  fit-on-load made nearly impossible) with a persisted collapse toggle.
- Edges routed through containers are clickable (builder hit-test priority: leaves → edges →
  containers), verified end-to-end on a block composite edge.
- Collab Share copies the room link (the live document) instead of a frozen snapshot without the room
  params. New e2e hooks: `__sceneToScreen` (scene→viewport px) joins `__edgeWaypoints`.

## 2026-07-03 — Family bug sweep: one root cause, many symptoms

- User reports: sequence broken, block/network/cloud routing broken, timeline not movable, C4 boundary
  not resizable, example select forgetting, gantt missing dependencies. Every report was REPRODUCED
  with screenshots before any fix, then re-verified after. The dominant root cause was one line: an
  unconditional app-side `snapSceneEdgesToMountPoints` on every render (from the cardinal-mounts era)
  that corrupted every non-box family's edges — sequence messages clamped onto the header boxes,
  mindmap/gitGraph elbows, detached timeline connectors. Deleted (the layout module already snaps
  exactly the right families internally, gated on `usesCardinalMounts`).
- The rest: label decollision re-ordered after the snap that was clobbering it + endpoint boxes as
  label obstacles + opaque label plates (renderer) killed the "struck-through label" look;
  maze/crossing/overlap passes classified as correctness (they run under classic now); micro-jog
  cleanup removed the Z-stubs; gantt grew dependency connectors; gitGraph classic tags lanes with
  pills; C4 became resizable; the Examples select stays in sync with the source. New
  `e2e/family-regressions.spec.ts` + a `__edgeWaypoints` e2e hook guard the scene-corruption class.
- Known remaining (documented in `modules/layout/DO_NEXT.md`): span-wide block boxes funnel edges
  through single side-centre mounts, so dense block diagrams still route wrap-arounds — needs
  multi-mount sides, the same redesign as block column spans / per-edge ports.

## 2026-07-02 — Structured logging: the app honours the §8 Logger contract

- All 32 free-form `console.error` calls across `main.ts`/`image-export.ts`/`persistence.ts` now route
  through `src/log.ts`: `appLog(level, event, data)` emits structured JSON lines via `@m/std`'s
  `consoleLogger`, with `AppEvent` a 25-member closed union (parse-failed, layout-failed,
  relabel-rejected, icon-pack-decode-failed, ws-override-rejected, …) and `data` carrying the
  per-occurrence detail. Grep `"module":"app"` in the console to filter; grep an event name to find its
  one failure class. Zero free-form console logging remains in the app's source.

## 2026-07-02 — Classic mode draws Mermaid-style spline edges (layered family)

- The last appearance-level Mermaid-parity gap: classic mode now renders the ELK layered family's edges
  as smooth basis-curve splines through the routed waypoints, exactly the Mermaid look. `plainEdges`
  became the closed `EdgeFinish` union; the app maps classic → `"spline"` for layered, `"plain"` for
  the maze-routed box families (their precision lanes must not be corner-cut by smoothing), and
  `"decorated"` for the house styles. Exports (PNG/SVG) follow the same finish. Edge hit-testing and
  label anchors still use the waypoint polyline — the spline passes through every waypoint, so the
  deviation between them is bounded; the full e2e suite (256 specs) confirms edge interactions are
  unaffected. Verified visually on the sample and a busy flowchart. Remaining parity gap after this:
  the ELK-vs-dagre engine difference (a layout ordering concern, tracked in modules/layout).

## 2026-07-02 — Mermaid font parity; e2e specs anchored to nodes, not pixels

- The renderer's default themes now use Mermaid's own 16px trebuchet font (completing appearance parity
  begun with the palette). Nodes resized ~14%, which invalidated the 27 e2e specs that targeted canvas
  nodes by hardcoded pixel offsets (`box.x + 88, box.y + 56`). Rather than re-tuning magic numbers to
  the new metrics — which would break again on ANY future metric change — those specs now use
  `e2e/support/nodes.ts` (`nodeRect`/`nodeCenter`/`clickNode`/`dragNodeBy`, anchored to the app's
  `__nodeRect` hook). New canvas specs must use these helpers; hardcoded node coordinates are how 27
  specs broke at once.

## 2026-07-02 — Audit housekeeping: docs truth, coverage gate, small refactors

- `AGENTS.md` §1/§4 and `make graph` finally learned `modules/relay` exists (Go, wire-coupled only).
- `make cov` joined the pre-push gate — the per-module coverage ratchets had drifted silently for
  months (layout −6, renderer −10, builder −1..−10 points below their thresholds on main) because
  nothing ran them; relay's `cov` now actually enforces a floor too (`-coverpkg` cross-package
  counting + an awk ratchet, 69%).
- Align/distribute math (`arrangeDeltas`) moved from `main.ts` into `@m/builder` core with unit tests;
  the relay and wasm-relay collab branches share one `connectCollab` helper (they had duplicated the
  same `connectTransport` call and onClose wording).
- Stale-docs sweep across parser/contracts/layout/renderer/app (verified each claim in code first);
  re-triaged two "maybe fixed" bugs visually — c4/network edge labels still bleed onto their own
  endpoint boxes on short segments (item narrowed: endpoint ancestors are excluded from the label
  decollision obstacle set), while skipped-over-node avoidance is confirmed shipped.
- `routeWaypoints`' degenerate-section straight line is now documented in `modules/layout/PLAN.md` as a
  defined-geometry boundary contract; `htmlInCanvasSupported` stays exported as the documented,
  blocked-on-Chromium detection seam (both audit items resolved by decision, recorded in DO_NEXT).
- The structured-logging gap (§8: ~29 free-form `console.error` calls) is recorded in DO_NEXT for its
  own focused pass.

## 2026-07-02 — Mermaid-parity rendering defaults; house styles opt-in

- Inverted the style defaults to match the product requirement: every family with a Mermaid equivalent
  now defaults to `classic` (previously ~10 of 15 defaulted to house styles marketed as
  "(Recommended)"). `defaultStyleForFamily` returns `classic` except network (tidy router), cloud
  (trunk), mindmap (radial IS the Mermaid shape), timeline (single real implementation). The renderer's
  default palette now matches mermaid's own `theme-default.js` (lavender fills, purple node borders,
  dark lines) and classic renders plain edges (no house chevrons/hops) on canvas AND in PNG/SVG exports.
- Cleaned the style dropdown of verified no-ops: c4/block/network/cloud's fake "Classic Mermaid"
  entries, timeline's dead "Classic Columns", and the unreachable `dot` entry are gone; mindmap's
  "Classic Tree" is relabelled "Boxed Radial" (it reshapes nodes, positions stay radial). Styles are a
  closed `LayoutStyle` union end to end; stored/DOM/URL values are validated at the boundary and an
  unknown persisted style logs loudly instead of silently disabling every flag.
- Share links carry the active layout style (`&style=`), applied for the recipient's visit without
  persisting (their own choice supersedes it); covered in `e2e/ux-regressions.spec.ts`.
- Fixed a style-dropdown bug the audit missed: `updateStyleOptions`/`syncStyleFlags` read the
  module-level `ast`, which still holds the PREVIOUS diagram during a render — so the dropdown lagged
  one render behind on every family switch (a cloud diagram showed the flowchart family's options; two
  e2e specs had unknowingly baked this in). Both now take the freshly parsed kind explicitly.
- e2e updates: tidy/organic/bus/trunk specs assert the new defaults (trunk/bus now genuinely exercise
  the cloud family); fit-on-load opts into the wide pills style via the new `#style=` link param
  (classic gitGraph is compact and fits at 100%); share-link spec asserts the style param. Layout prop
  tests run both classic and tidy pipelines. Coverage ratchets for layout/renderer re-based — both had
  silently drifted far above actual on main (nothing runs `make cov`; gate wiring tracked in module
  DO_NEXTs).

## 2026-07-02 — UX-audit fix pass: undo integrity, data-loss guards, status-channel discipline

- A four-way audit (known bugs, rendering modes, UI/UX flows, architecture conformance) surfaced eleven
  real UX bugs plus a set of fail-loud violations; this pass fixes the app-level ones. Undo integrity:
  example load and Add node are single recorded history steps; the navigator's keyboard connect commits
  through a recording `commitSourceEdit` port; every programmatic source mutation goes through one
  `setSourceValue` helper that refreshes the typing-session snapshot (stale snapshots were silently
  corrupting the next typing session's undo entry after ANY canvas-driven edit); the overlay similarity
  wipe no longer destroys the history stacks, surfaces in the status bar, and is skipped during
  undo/redo-driven renders (it used to wipe the exact state undo had just restored).
- Data-loss guards: viewing a `#src=` share link or `?example=` URL no longer overwrites the visitor's
  persisted diagram (persistence stays disarmed until their own first edit); loading an example in a
  collab room no longer drops `?collab`/`room`/`ws` from the URL, and its confirm dialog says the swap
  affects every peer.
- Status-channel discipline: `flashStatus` now carries a level and owns ALL action outcomes (rejections,
  confirmations, collab connection changes), while `setStatus` is reserved for parse/layout/render
  state — so an action error never dims a valid diagram, a confirmation never erases a live parse
  error's surfacing or the canvas's screen-reader description, and boot-time collab notices sequence
  after the initial render instead of being clobbered by its summary. Share gates on a valid render;
  export tooltips are restored rather than erased; rejected `?ws=` overrides and unknown `?example=`
  names surface in the UI instead of only the console.
- Fail-loud fixes per the repo contract: the empty catch in `setActiveStyle` and the silent fallbacks in
  `getActiveStyle`/the local-document identity-attach path now log (and, where user-relevant, flash);
  the swatch `data-accent` DOM string is validated against the `NodeAccent` union via `nodeAccentOf`
  instead of being cast.
- A11y/papercuts: Space activates a focused button instead of arming hand-pan (app-wide keyboard fix);
  dark-theme flash on load eliminated via a render-blocking `public/theme-boot.js` (external classic
  script — CSP-compatible); stale "undo (text in editor · layout on canvas)" copy replaced with the
  unified-history reality; the overflow menu is labelled "Export & more ▾"; silent no-ops (edge restyle
  on unsupported families, Alt+Arrow resize with nothing resizable, viewer picking an example) explain
  themselves. New `e2e/ux-regressions.spec.ts` locks in the four highest-impact fixes.

## 2026-07-02 — Backend-free demo runs the real relay in-process (WASM), not a skip

- `main.ts`'s backend-free branch (`useCollab && !useRelayTransport`) no longer hand-saves
  `session.onUpdate` snapshots straight to IndexedDB — it now calls `loadWasmRelay()` +
  `connectWasmRelay({ room, store })` (`@m/collab`'s new WASM-relay seam, driving `modules/relay`'s
  `cmd/relay-wasm` in-process) and feeds the result into the *same* `connectTransport(...)` call the
  real-relay branch already used. Persistence now happens inside the relay core's own debounced save
  (400ms, same as production), not an ad hoc per-update write. Two real bugs only surfaced by actually
  running the built demo in a browser (see `modules/relay/BUGS.md` for the full detail): `relay.wasm`/
  `wasm_exec.js` needed resolving against Vite's `BASE_URL`, not the site root (the Pages demo isn't
  hosted at the domain root); and WebAssembly compilation is blocked by this app's CSP
  (`script-src 'self'`) without an explicit allowance. Fixed the CSP gap narrowly in
  `tools/build-pages.mjs` — it patches `'wasm-unsafe-eval'` into the *built* demo's `index.html` only, so
  `app/playground/index.html` (every other build/deployment of this app) keeps the unmodified, stricter
  policy. Rewrote `e2e-pages/backend-free-collab.spec.ts` to prove real relay/RBAC involvement (a role
  badge from a genuine CONTROL frame, not the `__collabSetRole` test hook other specs use) while keeping
  the zero-real-`WebSocket` invariant; the full existing `app/playground` e2e suite (251 specs, unchanged)
  still passes, confirming zero regression to the real-relay production path.

## 2026-07-02 — Playwright's collab relay is now the Go binary (`modules/relay`)

- `playwright.config.ts`'s `webServer` entry for the dev collab relay now runs `modules/relay`'s Go binary
  (`cd ../../modules/relay && go run ./cmd/relay-server`) instead of `node modules/collab/server/relay.mjs`
  — that Node relay no longer exists (moved to Go, Milestone 1 of a native+WASM rewrite; see
  `modules/relay/PLAN.md`). The full e2e suite (251 specs, including all `collab-*` cross-tab flows) passed
  unchanged against it. One real bug surfaced by that run, fixed in `modules/relay`: `coder/websocket`'s
  default same-origin check rejected every real browser connection (the app and the relay are always
  different origins — different ports), silently breaking cross-tab sync/presence/role propagation while
  single-tab flows kept working; the `ws`-based Node relay never checked Origin at all, so this was a
  behavioral regression from the port, not a pre-existing gap — go run/e2e was the only thing that could
  have caught it, no unit test exercises two real browser tabs against a real dev server + relay pair.

## 2026-07-02 — Pages demo e2e joins the root gate

- Switched the backend-free Pages collab runtime from Web Storage snapshots to
  `@m/collab`'s async IndexedDB `RoomStore`, so `/demo/?collab` persists the real local Yjs room through
  a browser database while still omitting only the relay transport.
- Updated the Pages e2e to clear and assert the IndexedDB room snapshot directly.
- Added root `make e2e-pages` so the backend-free GitHub Pages artifact regression is addressable from
  the same command surface as the live UI e2e suite.
- Added the Pages Playwright project to the pre-push hook list, so `/demo/?collab` parity is checked
  before pushes instead of living only as a module-local manual target.
- Stabilised the app integration stress/fuzz timeout contract: those tests still catch hangs, but no
  longer treat a busy local/pre-commit run as a performance regression.
- Made the live UI e2e runner choose free app and collab relay ports per run, and pass the relay through
  the existing same-host `?ws=` override so local port collisions cannot break pre-push.

## 2026-07-01 — Pages backend-free demo e2e

- Added a dedicated Playwright Pages project that builds the static GitHub Pages artifact and serves
  `site-dist/demo/`, separate from the normal Vite dev-server UI suite.
- Added a backend-free `/demo/?collab` regression: no WebSocket is opened, a canvas drag records a
  local Yjs room snapshot through the browser room store, and reloading the built demo rehydrates the
  override.

## 2026-07-01 — Backend-free demo uses local collab runtime

- Changed the GitHub Pages backend-free build so `?collab` still constructs the real `@m/collab`
  Yjs-backed document, source binding, undo manager, overlay save seam, and status hooks; only the relay
  transport is omitted because Pages has no server.
- The public demo now exercises the same in-browser collaboration runtime as production/dev instead of
  reporting that collaboration is disabled. A future embedded SQLite/WASM store can attach at the
  persistence seam without changing the app call sites.
- Wired that backend-free local collab runtime to `@m/collab`'s browser `RoomStore`, saving whole Yjs
  room snapshots in Web Storage when no relay is present. Share links and `?example=` loads still win
  over a stored room snapshot.

## 2026-07-01 — Sequence message style coverage

- Added demo-level Playwright coverage for selecting a sequence message and cycling its arrow style
  through `->>`, `-->>`, `->`, and `-->`, proving the sequence path has parity with flowchart/block
  edge restyling.
- Marked the stale sequence restyle backlog item done now that parser source spans, builder patching,
  app wiring, and e2e coverage are all present.

## 2026-07-01 — Node colour hardening

- Hardened the node colour swatches as named radio controls with arrow-key movement, so the visual-only
  colour overlay is keyboard and screen-reader operable.
- Extended node colour e2e coverage to prove local persistence, share-link roundtrip, and clearing the
  accent back to the default fill.

## 2026-07-01 — Share and icon-pack polish

- Changed Share so the normal clipboard-success path no longer overwrites the current demo URL hash;
  the address bar is used only when the link is too large, clipboard is unavailable, or clipboard write
  is blocked.
- Exposed the custom icon-pack loader directly inside the icon picker drawer, while keeping the export
  menu entry for keyboard/menu workflows.
- Updated share-link, overlay-share, edge-style share, and icon-picker e2e coverage for the new behavior.

## 2026-07-01 — Minimap keyboard feedback

- Added live-region announcements for minimap keyboard panning, including arrow-key moves and
  Home/End jumps, so keyboard users get the same feedback loop as other canvas navigation commands.
- Extended the minimap Playwright coverage to assert the spoken feedback alongside the scroll change.

## 2026-07-01 — Unified transient confirmations

- Routed transient command confirmations through the same task-guidance refresh as durable status
  updates, while keeping them from overwriting the diagram's canvas `aria-label` or stale/error state.
- Added Playwright coverage for a Relax confirmation showing in the status bar while selected-node task
  guidance and the canvas diagram label stay intact.

## 2026-07-01 — Keyboard resize affordance

- Added `Alt+Arrow` keyboard resizing for the single selected resizable node, using the same sidecar
  size override and undo path as corner-handle resize.
- Updated the demo footer/help shortcut text and added Playwright coverage for keyboard resize plus
  undo.

## 2026-07-01 — Disabled action reasons in task guidance

- Mirrored Add/Relax/Connect/Duplicate disabled reasons into the always-visible task guidance, using the
  same capability state as the toolbar/context controls so touch and keyboard users get the reason
  without hovering.
- Let footer task guidance wrap instead of ellipsizing, and added Playwright coverage for the visible
  disabled-reason text.

## 2026-06-30 — Network icon pixel assertion

- Strengthened the network icon e2e from "no resolve failures" to canvas pixel sampling across every
  default network node kind, proving bundled vendor glyphs are visibly painted in the demo.

## 2026-06-30 — Imported override regenerate assertion

- Added Playwright coverage for a shared/hash-loaded overlay containing an unpinned node position, then
  pressing Regenerate and asserting the override is removed while the flowchart remains rendered.

## 2026-06-30 — Selected edge overlay assertion

- Added Playwright coverage for the selected-edge route overlay: the test selects a labelled edge and
  samples the canvas pixel at the route label-anchor handle, proving the blue handle is actually painted
  instead of only screenshot-reviewed.

## 2026-06-30 — Catalog cardinal-mount gate

- The Examples integration test now fails any routed catalog diagram whose edge endpoints are off the
  top/bottom/left/right node mounts, with edge/node/end diagnostics. The sweep covers normal layout and
  bus/trunk variants for C4, block, network, and cloud.

## 2026-06-30 — Selected mount visual guard

- Added a dark-theme selected-node screenshot flow so cardinal mount handles are visually reviewed in
  both light and dark themes, not only checked by geometry assertions.
- Regenerated the local demo screenshots and verified the current catalog still passes all shot flows.

## 2026-06-30 — Demo-visible label and icon parity

- Edge labels are now draggable as canvas objects. The app stores their route-relative `labelT`, uses
  the same anchor for painting overlays, hit testing, inline editing, e2e hooks, and context-bar
  placement, and preserves that position across rerenders/reroutes.
- Selected nodes now show their four cardinal mount points in the canvas, and Relax/display rerenders
  preserve those mounts for flowchart, C4, block, network, cloud, state, ER, class, and requirement.
- Plated edge labels render with 66% opacity for both the transparent background and text foreground.
- Labels containing literal `\n` now render and hit-test as multiline labels; the app text measurer
  sizes by the widest rendered line.
- The demo catalog now shows cloud/network examples with bundled vendored icons, keeps the original
  BPMN glyph pack untouched, and includes state `direction LR` in the state starter.
- The screenshot harness now renders the public Examples menu sources for the main diagram-family
  shots, including cloud, network, timeline, Gantt, DOT, and both BPMN workflows.
- Added E2E coverage for dragging an edge label itself and preserving that route-relative position
  after the edge is rerendered.
- Added E2E coverage for the Relax diamond mount-point regression and for UI label dragging across every
  graph family that emits edge labels.

## 2026-06-30 — Demo parity, architecture, and drag fixes

- Made cloud and network first-class style families in the UI, with cloud defaulting to trunk routing.
- Expanded the demo catalog across families, including a more complex cloud topology that shows trunked
  cross-tier routing and a left-to-right network perimeter.
- Replaced placeholder BPMN starters with realistic retail-banking onboarding and insurance-adjusting
  workflows using built-in BPMN event/task/gateway icons.
- Wired Gantt drag so `after ...` tasks materialize to explicit dates, and added timeline drag coverage
  now that connectors are real edges.
- Captured and reviewed local demo screenshots in `/tmp/mermollusc-review-final` for cloud, network,
  BPMN, Gantt, and timeline.

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
- Extracted the Examples menu catalog to `src/examples.ts`, fixed the sequence starter to use the
  parser-supported single-token participant label (`WebApp`), and added an integration test that runs
  every menu example through `parseDiagram`.
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
  (typecheck + lint + format clean; the then-current Playwright suite green; launch screenshot verified). The
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
- Collab Phase 2 — forward an Auth0 access token to the relay as the first WebSocket auth frame; the
  relay verifies it when auth is enabled. Absent in local dev → the relay's default allow-all accepts,
  so single-user and the `?collab` flow are unchanged.
- Collab hardening — the relay URL no longer carries tokens, and `index.html` now ships a CSP with
  `connect-src` scoped to same-origin, local dev endpoints, and secure WebSockets.
- Collab Phase 2 — browser Auth0 login. When `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and
  `VITE_AUTH0_AUDIENCE` are configured, the app exposes a Sign in/out control, runs Authorization Code
  + PKCE through Auth0, stores the access token in session storage, sends it as the first WebSocket auth
  frame, and derives presence name/colour from token claims. The app CSP now permits HTTPS token
  exchange endpoints, while backend-free Pages remains zero-relay/zero-auth unless those env vars are
  intentionally supplied for a relay-backed build.
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
- Robustness (perf track): added a **big-graph stress / linearity guard** (`test/integration/stress.test.ts`)
  — 3000-node network and block diagrams driven through the full pure pipeline (parse → layout →
  display list). It pins the O(n) behaviour: the runs finish in tens of ms today, so an accidental
  O(n²) (or a crash) would blow vitest's timeout / fail the counts. (The earlier audit confirmed the
  pure layouts and `toDisplayList` are linear; this keeps them that way.)
- New family (Gantt) — **activation**. Added `GanttAst` to the `DiagramAst` union and wired the family
  end-to-end: `parseDiagram` routes `gantt`, `layoutDiagram` dispatches to `layoutGantt`, and the app's
  exhaustive family switches got `gantt` arms (Connect/Delete are no-ops — gantt is render+drag for now,
  no edge concept or task-line patcher yet; the render path captures no source map, like pie). Added a
  Gantt example to the menu, a pipeline golden, and +2 e2e (render with `after`-chains; example loads).
  The type-hardening exhaustiveness made this a self-checklist — it wouldn't compile until every
  dispatch site handled `gantt`. Renders as task bars on a day axis; screenshot-verified the `after`
  staircase. (Renderer needed no change — bars are plain rect+label nodes.)
- Perf: cut redundant per-frame work in `paintScene` during interactions. (1) The minimap cache is a
  *second* full render of the scene; rebuilding it every drag/resize/marquee/connect frame doubled the
  per-frame cost — now it's skipped while interacting and refreshed on release (the minimap goes briefly
  stale, then snaps correct). (2) The canvas backing store is only re-sized when its pixel dimensions
  actually change, instead of being reallocated (which clears the canvas) every frame regardless. The
  release of drag/resize now always repaints so the deferred minimap refreshes. (Profiled the drag
  frame and targeted the redundant *static* work rather than rewriting the main draw path.)
- Gantt inline relabel: capture the `GanttSource` map (a `parseGanttWithSource` pass alongside the
  render, like the other families) into `ganttSource`, and add a relabel branch — double-clicking a task
  bar / milestone opens the inline editor on its label span and patches the source. Brings Gantt to
  relabel parity with the other families (its structural edits were no-ops). +1 e2e (gantt-edit).
- Gantt structural delete: the Delete key now removes a selected task via `deleteGanttTask` keyed by the
  `ganttSource` label span (so auto-id tasks delete too). Multiple selected tasks are deleted bottom-up
  (descending span offset) so each span stays valid against the prior edit. +1 e2e. Gantt now has full
  relabel + delete parity with the other families.
- Accessibility — keyboard node navigator (foundation): the diagram is now operable without a mouse. A
  visually-hidden focusable `listbox` (`#diagram-nav`) mirrors the scene's nodes (rebuilt each render);
  focus + arrow keys move the active option, which drives the canvas selection (so the node highlights
  and the existing Delete handler removes it), centres it in view (reusing the minimap's scroll math via
  a factored `scrollToLogical`), and a polite live region (`#diagram-live`) announces "label, N of M".
  +1 e2e (focus → activedescendant + announcement → arrow → Delete). Next a11y steps below.
- Accessibility — keyboard operation (Enter relabel + action announcements): extracted the canvas
  double-click relabel into a reusable `beginRelabel(shown, hit, groupHit)`, so pressing **Enter** on the
  navigator's active node opens the inline editor (keyboard parity with a double-click). Delete now
  announces its outcome ("deleted N items") through the live region. +2 e2e (Enter→relabel; delete announce).
- Accessibility — keyboard move + a double-fire fix: **Alt+Arrow** now nudges the navigator's active node
  (⇧ = larger step), reusing the same override/undo path as a drag, with a "moved <label>" announcement.
  Fixed a latent bug from the navigator landing: the global arrow-nudge handler also fired while the
  listbox was focused, so plain-arrow *navigation* moved the node every step — it now yields arrows to the
  focused navigator. Added the keyboard shortcuts to the help panel. +1 e2e (navigate ≠ move; Alt nudges).
- Accessibility — keyboard Connect: a two-step `c` from the node navigator picks the active node as the
  source (announced), then after navigating to a target, `c` again draws the edge in the family's own
  syntax via the existing `appendEdge` (parity with an Alt-drag); Escape cancels. This completes keyboard
  operation parity (navigate · relabel · move · connect · delete). +1 e2e; help panel updated.
- Accessibility — spoken topology: the node navigator now announces each node's connections alongside
  its label and position ("Beta, 2 of 3. to Gamma; from Alpha", capped so a hub stays concise, or "no
  connections"), so a screen-reader user grasps the graph structure, not just a flat node list. +1 e2e.
- Accessibility — motion + focus polish: a comprehensive `prefers-reduced-motion` media query now collapses
  every animation/transition (the entrance rise, the error-bar shake, UI transitions) to ~0 (WCAG 2.3.3);
  the example `<select>` regained a keyboard `:focus-visible` ring; and the visually-hidden node navigator
  now rings the stage (`.kbd-focus` on `#stage-wrap`, toggled on focus/blur) so a sighted keyboard user
  sees focus is in the diagram. Navigator blur also clears an in-progress Connect. +2 e2e.
- Accessibility - edge targets in the keyboard navigator: the hidden listbox now mirrors nodes followed
  by edges, so screen-reader users can reach the relationships themselves instead of only hearing them
  from adjacent nodes. Edge items select/highlight the edge, announce readable endpoints plus the edge
  label, centre on the routed label anchor, support Enter relabel through the existing inline editor, and
  Delete removes the edge while leaving endpoint nodes intact. +1 e2e; updated the existing navigator
  coverage from 3 node-only options to 3 nodes + 2 edges.
- UI/UX polish: fixed the phone-width shell layout. The topbar now stacks before wrapping controls,
  the workbench switches from desktop editor+stage columns to editor-over-stage rows, the status bar
  wraps cleanly, and the icon drawer clamps to the viewport width. This removes page-level horizontal
  overflow at 390px while preserving stage-internal scrolling for the diagram sheet. Also updated the
  keyboard-help and hidden navigator copy from "node list" to node+edge "diagram items". +1 responsive
  e2e plus a11y/help copy assertions.
- UI/UX quality sweep: broadened live-region feedback so screen-reader users hear outcomes for canvas
  and shell actions beyond the original relabel/delete/connect path (copy/paste, grouping, lock,
  arrange, theme/sketch, icon load/insert, export/copy/share, layout undo/redo). The help modal and icon
  picker now trap Tab while open, close on Escape, and restore focus to their trigger. Mobile coverage now
  drives real phone-width workflows (navigator relabel, help, icon drawer, stage pan/zoom), and
  `make shots` gained a 390px responsive shell capture. The shot target is explicitly phony so it runs
  even when the generated `shots/` directory exists; the icon-picker shot captures the viewport instead
  of a huge full-page registry image, avoiding screenshot timeouts while still showing the open drawer.
  Measured the remaining production bundle warning: one JS chunk at about 2.8 MB minified / 845 kB gzip.
- GitHub Pages demo: added a root presentation page under `site/`, a `make pages-build` artifact build
  that places the playground at `/demo/`, and a Pages workflow using the current GitHub Actions
  artifact deploy path. The demo build sets `VITE_BACKEND_FREE_DEMO=1`, so even `?collab` stays
  local-only and reports that collaboration is disabled.
- Example/showcase polish: upgraded the picker samples so state diagrams exercise start/end/fork/join/
  choice/notes, ER defines every relationship endpoint, and sequence/timeline/pie tell richer stories.
  Added state-polish and sketch-state screenshot flows so the visual review pass captures the new
  marker and hand-drawn behavior.
- Production build polish: added a Vite config that separates editor, pipeline, collab, icon, and ELK
  layout-engine chunks; build output now exposes the remaining large icon/layout targets instead of one
  undifferentiated app chunk.
- Regenerate now preserves pinned manual node overrides by replacing the overlay override map with only
  pinned entries before re-layout; unpinned manual positions still clear. +e2e.
- Family polish: the pie example now showcases `pie showData donut`, the display-list golden records
  donut inner radii, and screenshot flows cover side-aware state notes plus a donut chart.
- Computational workbench redesign: shifted the app chrome away from the drafting-table look toward a
  denser professional notebook/workbench interface without copying a proprietary product. The header
  controls are grouped into command clusters, the editor/stage read as source input and output, the
  graph-paper surface is quieter, the palette is neutral with a restrained red/orange accent plus teal
  success/action colour, and dark mode resets native controls so button labels stay readable. Verified
  with desktop, phone-width, and dark-mode screenshots plus the full Playwright UI suite.
- Test polish from the redesign: the reshape e2e now presses `S` through the restored keyboard
  selection instead of re-clicking a stale hard-coded canvas coordinate after re-layout.
- UX audit follow-up: regenerated and reviewed the full visual-flow set against the personas in
  `docs/user_stories.md`. Fixed the review harness so `make shots` clears stale generated PNGs before
  capture, added a shortcut-help modal shot, compacted the phone-width header/toolbars so the rendered
  output appears in the first viewport, and widened the help modal so keyboard-only guidance no longer
  wraps awkwardly on desktop.
- UX follow-up review with scoped flow agents: fixed stale live selection after source replacement,
  blocked PNG/PDF/SVG/DOT/copy while the current source is stale, filtered no-op Arrange moves so
  already-aligned nodes are not pinned into overrides, and disabled Connect until 2+ live nodes are
  selected. Added an in-stage empty state for malformed first-load/shared sources, made the minimap
  keyboard operable, added a high-contrast canvas/minimap theme for forced-colors mode, gave the icon
  picker a modal backdrop, and made the screenshot harness own its preview server instead of reusing a
  possibly stale process. Focused e2e now covers stale selection, stale export/copy blocking,
  malformed shared-source recovery, keyboard minimap panning, forced-colors rendering, and the drawer
  backdrop.
- Task-based UX polish pass: reviewed fresh screenshots and scoped agent feedback before editing.
  Kept the product as a professional text-to-diagram workbench while borrowing only functional
  game-like affordances: a compact task HUD, pixel-corner control ticks, clearer action/blocked task
  states, and a tactical overview feel for the minimap. Fixed mobile toolbar clipping by wrapping
  command groups, made selected edges visibly highlight with a route halo and label-anchor marker,
  made selection/resize/marquee/connect overlays zoom-stable, added canvas hover cursors for move,
  resize, connect, and selectable targets, and rebuilt the minimap cache on viewport resize. Added
  e2e coverage for mobile clipped controls, task guidance states, edge-selection guidance, minimap
  resize recalculation, plus a new edge-selected visual shot.

- **Multi-dimension audit omnibus (2026-06-23).** Implemented the verified findings from a multi-agent
  UX/product/architecture/backend audit. App layer: a per-family capability record gates Connect + the
  icon picker (no more corruption-by-affordance); two-way relabel/edge-label commits validate against
  the span delimiter and fail loud; text edits preserve manual layout (prune-vanished-ids-after-layout
  instead of wipe-on-keystroke); Share carries the overlay and the hash is parsed per-segment; loading
  an example confirms only over authored work; accessibility (editor aria-label, labelled inputs,
  minimap role=application, 28px close target, error-state canvas label + announcements); platform-aware
  shortcut chips (⌘/⌥/⇧ ↔ Ctrl/Alt/Shift) + Ctrl additive-click; an in-app "Syntax by family" reference
  in the help overlay; self-healing `reconnectingWebSocketTransport` + surfaced overlay-reject status;
  a single `parseDiagramWithSource` pass per edit with `applyOverrides`/group-bounds frame memos; and a
  first decomposition of `main.ts` into `pdf.ts`/`raster.ts`/`platform.ts`/`syntax-reference.ts` (snap
  geometry + `messageOf` sourced from `@m/builder`/`@m/std`). Added `e2e/audit-omnibus.spec.ts` and
  broadened the a11y name guard; updated three existing icon/responsive specs that opened the picker on
  a now-correctly-gated flowchart. The render-debounce attempt was reverted after the full e2e suite
  caught a scene/source desync across the existing drop-stale guard (tracked in DO_NEXT).

- **Miro-like round (2026-06-23).** A specialized multi-agent review (whiteboard parity, interaction
  architecture, two-way coverage, widget design, a11y, architecture) drove a tool model + on-canvas
  widgets + deeper tests. Landed: a closed-union tool mode (select/hand/connect/place) that biases the
  existing gesture branches without regressing modifiers (select == today verbatim); V/H/C/P + Space-pan
  + Esc→select; tool-aware cursors and add-then-pin Place. A stage-pinned floating tool palette
  (radiogroup, roving tabindex, per-family disable/fallback) and a selection context mini-toolbar (a thin
  view over existing handlers, driven by the shared `CapabilityState`). Zoom cluster relocated onto the
  stage. Refactors that unblocked the widgets: module-level `isInteracting()`, extracted
  `deleteSelection()`, and `computeCapabilities()`→`CapabilityState` consumed by both the workbench and
  the context bar. New e2e: relabel-reject (fail-loud validation), multi-delete, connect-drag source
  assertion, tool-modes, tool-palette, context-bar; broadened nothing that regressed (168 specs green).

- **Demo + examples pass (2026-06-23).** Added a topbar Reset control (clears `mermollusc-*`
  localStorage + reloads the clean URL). Gave the cloud family directed `-->` traffic edges (contracts
  `CloudLink.directed`, parser, layout arrowhead) and made the cloud example a realistic tiered AWS web
  architecture with authentic AWS icons and labelled traffic paths; the cloud layout now wraps wide
  rows so a large architecture stays compact. Added two BPMN-style swimlane workflows. Per review
  feedback, made every new demo semantically correct (declined-payment cancels rather than refunds;
  CloudFront/WAF/ALB/API-Gateway in the right order). Verified the new on-canvas widgets in dark mode.
- Subgraph move: dragging or nudging a container (subgraph / c4 boundary / composite state) now carries
  every node nested inside it (shared `withContents` over `descendantsOf`), and `applyOverrides` re-routes
  connectors live — interior edges translate rigidly, boundary-crossing edges blend to stay attached. +e2e.
- Auto-tidy connectors after a move: `shownScene` runs `retidyRoutes` over the overridden scene for the
  box-and-arrow families (not sequence), so a boundary-crossing edge a move blended into a diagonal snaps
  back to clean right angles — display-only, `scene`/overrides untouched (undo + persist unaffected),
  no-op when nothing moved. +`__shownEdges` e2e hook +e2e.
- Fuzz round 2 + example polish: extended the pipeline fuzz to render (layout → display list → SVG over
  mutated examples, both themes; asserts no throw and no NaN/Infinity in the SVG) — it found a c4/
  subgraph stack-overflow class fixed in @m/layout + @m/parser. Added a deterministic overflow-guard
  regression test. Reworked five menu examples to exercise the features their stories promise: c4
  (descriptions on every container), block (a `block:id … end` composite + spans), network (DMZ/app/data
  subnet groups + firewall/LB), gitGraph (three lanes, two merges, a HIGHLIGHT commit), mindmap (real
  subject + alternate node shapes). Screenshot-verified each.
- Sequence notes end-to-end: the example shows an `over` and a `left of` note; a note box is a real
  scene node — selectable, relabel via its text span, delete via `deleteLineAt`, and deleting an actor
  strips the notes anchored to it (the formerly-dead `deleteActor` `SEQ_NOTE` branch is now live). Plus
  three boy-scout a11y fixes: tool-rejection feedback uses `flashStatus` (no longer clobbers the canvas
  aria-label), the `S` shape-cycle shortcut is gated off DOT imports, and the visual `#stage-hud` lost
  its duplicate `aria-live` (the task hint was announced twice).
- Fuzz round 3 + UX/contrast audit fixes. Added an 800-run sequence-note layout fuzzer (interleave +
  negative-x shift + `over A,B` span stay total with finite, non-negative geometry). Contrast: raised
  the chrome border tokens (`--line`/`--line-strong`/light `--hud-line`) to ≥3:1 against their surfaces
  so interactive-control boundaries meet WCAG 1.4.11 in both themes. A11y/UX: modal dialogs now mark the
  page chrome `inert` (not just `aria-modal`); the navigator suffixes note boxes with "(note)"; canvas
  shortcuts are suppressed while the inline label editor has focus (a bare `s` no longer cycled the node
  shape mid-rename) and `S` off-flowchart now explains itself instead of a silent no-op; Regenerate is
  disabled on an invalid source like Relax/Add. +e2e (regenerate-disable, modal-inert).
- Fuzz round 4 + audit fixes. Found+fixed a multi-delete corruption: only gantt sorted a select-all/
  marquee delete bottom-up by source span, so pie/timeline/mindmap (also span-keyed) deleted top-down
  and an earlier removal shifted later spans → half-spliced source. Generalised the bottom-up sort to
  every span-keyed family (`sourceOffset`). +e2e (select-all clears pie/timeline/mindmap) +a 300-run
  multi-delete fuzzer (arbitrary subsets stay parseable). Contrast: the collab "view only" role badge
  hardcoded #8a5a00 text with no dark override (~1.85:1 in dark) and a ~1.3:1 light border — added a
  dark-theme override (text/fill/border ≥4.5:1 / ≥3:1) and a solid light border.
- Fuzz round 5 + export/IO audit. Found+fixed two DOT-export bugs in @m/renderer (pie markers exported
  as orphan boxes; cluster ids growing a prefix each round-trip) and corrected the wrong "pie exports as
  empty" comments. Added a DOT export→import→export **fixed-point fuzzer** (every example + mutations
  reach an idempotent serialisation) plus deterministic pie-empty / cluster-stable regression tests.
  Agent audit confirmed export/share-link/PDF/SVG, collab RBAC+transport+sync, icons, and @m/std are
  otherwise clean.
- UI shell restructure for screen real estate + mobile (specialized UI/UX design pass). (1) The export
  cluster (Copy/PNG/PDF/SVG/DOT/Share/Load icons) + Reset moved off the topbar into an "Export ▾"
  overflow menu — a non-modal popover (the Arrange pattern) fixed-positioned under the trigger so it
  escapes the topbar's clipping; ids/handlers/gating unchanged, so capability state still drives the
  items. (2) The source editor is collapsible/expandable (`#source-collapse`), persisted, with the head
  as the always-visible handle; a parse error force-reveals it (without overwriting the preference) so
  the lint/click-to-locate stay reachable; `editor.refresh()` re-measures CodeMirror on expand. (3) The
  tool palette + selection context bar are no longer hidden under 760px — they're reachable and 44px
  touch-sized, so every canvas action works on a phone. Together these reclaim canvas surface on every
  viewport. +e2e (collapse/persist, parse-error reveal, overflow menu open/run/Escape/outside-click,
  mobile palette touch target). The ~11 export/share/reset specs open the menu first via a shared helper.
- Edges are now fully editable from the canvas (flowchart + block): double-click a BARE edge to add a
  label (spliced after its arrow), and the Shape button / `S` key doubles as an edge "Style" control
  that cycles the arrow (`-->`/`---`/`-.->`/`==>`) on a selected edge. Plus the edge-label overlap fix
  in @m/layout (cloud/c4/network/block breathe; labels ride the clear channel). +builder units, +e2e.
- Fuzz round 6 + a11y audit fixes. Added an edge-edit fuzzer (random restyle/add-label/rename sequences
  over flowchart + block, re-parsed each step — always parseable). A focused audit confirmed the recent
  edge-editing/layout/new-UI work is otherwise clean (contrast of the Export menu / collapse handle /
  Style button all pass). Fixed two keyboard-a11y defects it found in the Export overflow menu: the
  "Load icons" `<label role=menuitem>` was unfocusable (no tabindex → arrow-roving stalled and it was
  unactivatable) — now `tabindex=-1` + Enter/Space opens its file input; and activating an item by
  keyboard dropped focus to <body> — `closeMore` now returns focus to the trigger when focus was inside
  the menu. +e2e (menu keyboard roving + focus return).
- Edge-rename bug fix + reset-positions + selection→source highlight.
  - **Edge rename "seemed bugged":** the hit-test only checked the edge *line* (6px) but the label is
    drawn ~11px off it, so double-clicking the visible label missed the edge. Added app-level
    edge-LABEL hit-testing (a click on the label selects its edge) + bumped the line tolerance to 9px.
    This makes rename (double-click + context-bar) and restyle reliably reachable.
  - **Reset positions:** a new editor-tools button + `window.__resetPositions()` API hook clears every
    manual position/resize (keeps groups), returning the diagram to its from-text default layout. Undoable.
  - **Selection→text highlight:** selecting a node/edge on the canvas now highlights its declaration
    span in the source editor (`editor.select`, no focus steal), across every family. Memoised + guarded
    so it never fights the typist or churns mid-drag.
  +e2e (label-click rename, reset-positions UI+API, selection highlight node+edge).
- Sweep round (audit-driven fixes, fuzz, monkey coverage):
  - Source-corruption fixes wired through the app: timeline/gantt relabel now uses the `colon` context
    (no `:`-splitting); ER/class quoted relationship labels round-trip cleanly.
  - Viewer mode (collab): the relax/regenerate/reset-positions/add-node buttons are now truly `disabled`
    (re-applied on role change), not just CSS-dimmed — keyboard/AT can no longer "press" them.
  - Share link: warns loudly when the encoded URL exceeds ~8000 chars (would be truncated when pasted)
    instead of reporting a confident "copied".
  - DOT export: marker-only families (pie/timeline/gantt) warn ("no graph nodes") instead of silently
    downloading an empty `digraph {}` with an "ok" status.
  - Delete: deleting a container now confirms before cascading to its nested children (count shown).
  +tests: label-edit fuzz (timeline/gantt/er), a deterministic UI "monkey" (60 random clicks/keys/
   toggles, asserts no uncaught error), plus e2e for each fix above.
  - a11y polish (audit follow-ups): the selection context-bar now uses roving tabindex (one tab stop,
    arrows move within — the ARIA toolbar pattern it claimed); a locatable error status is exposed as a
    keyboard-operable button (role=button/tabindex + Enter/Space → jump to the error); the inline label
    editor is clamped into the viewport so an edge-of-canvas / phone-width node doesn't spill off-screen.
  +e2e (status-line keyboard jump, context-bar single tab stop).
- Area selector ("cowboy selector"): a plain drag on empty canvas with the Select tool now rubber-bands
  a marquee selection (was Shift-drag only); pan stays on the Hand tool / space-drag. Powers multi-select
  → the multi-range source highlight.
- Two-way editing for Gantt + audit. Dragging a bar now rewrites its start date and resizing rewrites its
  duration *in the source* (a bar's x/width are semantic — dates/durations — not layout overlay). New
  gantt date/duration source spans (@m/parser), pure `shiftGanttStart`/`setGanttDuration` (@m/builder,
  UTC date math), and drag/resize-end interception that patches the text + clears the preview override.
  Explicit-date tasks reschedule; `after`-chain tasks (no calendar anchor) fall back to the overlay.
  **Audit:** Gantt was the only real violation — for every other family a node's position/size is pure
  layout (correctly the overlay), since nothing in their source encodes geometry. Pie slice *values* are
  source-semantic but aren't drag-manipulated (radial wedges, not draggable boxes), so no violation there.
- UX-review + QA-agent follow-ups (two specialized agents reviewed the branch):
  - Marquee: the Select-tool empty-canvas cursor is now a crosshair (was a misleading grab/pan cursor);
    touch keeps one-finger empty-drag as a pan (the marquee is a mouse/pen gesture, so it never fights
    native scroll); the area selector now also catches edges (their source highlights with the nodes).
  - Gantt: a bar resize is locked to the horizontal (width=duration) and a drag is locked to its row, so
    the live preview no longer distorts height / floats off the calendar before the snap-back; an
    `after`-chain bar that can't reschedule snaps back with a "scheduled by its dependency" hint instead
    of leaving a free-float overlay.
  - Hardened the selection-highlight decoration against out-of-range spans (a stale span on a shrunk/
    empty doc — an undo, or collab before first sync — threw a CodeMirror RangeError; the QA agent's
    Gantt fuzz found no source corruption, and its run surfaced this collab highlight crash).
  - Boyscout: stale `zoom.spec.ts` pan test updated for the new marquee semantics; two Biome nits
    (`indexOf`, optional chain) cleaned.
- Curved edges (styling palette, part 1). A context-bar "Curve"/"Straighten" toggle sets a connector to
  a smooth spline. Curves have no Mermaid syntax, so per your call this is a *visual-only* overlay: a
  per-browser preference keyed by edge id (its own localStorage key, NOT the shared/collab position
  overlay), applied to the scene at render time. Works for every family's edges; survives reload; cleared
  by the full Reset. +e2e (toggle + persist + straighten); +renderer `smoothSegments` unit tests.
- Node colour (styling palette, part 2). A context-bar "Colour" control cycles a node through the accent
  palette (none → blue → grey → red). Our renderer fills from a closed accent set (not arbitrary hex), so
  like curves this is a visual-only overlay — per-browser, keyed by node id, applied at render time —
  rather than a source `style` line the pipeline can't render. +e2e (cycle + persist).
- Styling moved into the overlay document (follow-up: "source stays vanilla Mermaid, styling in the
  overlay"). The curve/colour prefs were promoted from app-local localStorage into the real `OverlayDoc`
  (new `edgeStyles`/`nodeStyles` layers): so styling now persists, **serialises into share links**, is
  **undoable** like positions, and the Mermaid source stays untouched. Cross-cutting: contracts (overlay
  model + port + serialization schema, back-compat default for legacy overlays), `applyStyles` in
  @m/builder, the local document-model, and the collab session (styling is per-client in-session for now
  — positions/groups still sync; sharing styling across peers is the noted follow-up). +e2e (share-link
  round-trip + undo).
- Edge route control: the context-bar button now cycles a connector through Square → Straight → Curved
  (was a curve on/off toggle); the route is per-edge overlay state (persists, shares, undoable), curved
  rendering rounds only the corners, and edge labels follow the edge when its endpoint is dragged.
- "Tidy layout" toggle (#tidy, persisted): re-lays-out the layered families by picking the lowest-
  crossing of a few deterministic ELK candidates; default (off) is unchanged. Opt-in, like Sketch/Theme.
- The "Tidy layout" toggle now also tidies gitGraph (branch-lane reordering to cut cross-lane crossings),
  on top of the layered families.
- "Organic" toggle (#organic, persisted): force-based (ELK stress) layout for flowchart/state — a
  free-form alternative to the layered default. Opt-in, like Tidy/Sketch.
- Edge routing now avoids obstacles automatically (an edge that would cross an unrelated node detours
  around it), via the layout's `spreadPorts` — no UI, on by default since it only changes crossing routes.
- Edge routing now bends around multiple obstacles (grid maze router behind `spreadPorts`), and the cloud
  architecture diagram gets a wider inter-row channel so its cross-tier links separate cleanly.
- Tidy now also straightens the ELK families' edges around residual obstacles (maze reroute), and dense
  architecture diagrams (cloud/network/c4) de-collide overlapping edge labels.
- Edges now avoid crossing group containers they don't connect into and pick the clearest of a node's
  four sides when detouring; overlapping edge labels de-collide to the nearest free spot, for all families.
- Stable, shareable per-example URLs: selecting an example sets `?example=<name>`, and loading such a URL
  opens that example (falls back to persisted/sample for an unknown name; starts with a clean overlay).
- The gitGraph example is now a semi-complicated git-flow (main + develop + feature + hotfix, merges and
  release tags) showcasing the stickman-per-branch, short-SHA, arrowed connectors.
- Zoom-to-fit on load: the initial render and every example load now call `fitView`, so a wide diagram
  (e.g. the full git-flow) is visible at once. Caps at 100%, so a small diagram is left untouched.
- Unified Layout Style Dropdown UI: Replaced the isolated `#tidy`, `#organic`, `#bus`, and `#trunk` toolbar buttons with a single dynamic `#layout-style` select dropdown. Options are populated context-sensitively based on the current active diagram's family. Selections are stored and persisted per diagram family in local storage so switching diagram types automatically restores the last chosen layout style. Supported styles include custom modes like classic vs relaxed sequence (curved message lines), radial vs classic mindmaps (straight links and rect nodes), classic vs donut pies, and classic vs pills gitGraph (commit dots and straight lines).
- Multi-touch Canvas Gestures: Implemented pinch-to-zoom and two-finger pan scrolling on the canvas viewport, using pointer capture and logical midpoint offset tracking to prevent layout and single-finger selection drift.
- Mobile Bottom-Sheet Context Menu: Restyled the selection context bar (`#context-bar`) on small screens (max-width: 500px) as a scrollable bottom-sheet, and added pure CSS rules to automatically hide the overlapping minimap and HUD when the context menu is visible.
- Sequence Message Style Cycling: Extended edge style cycling to sequence diagram message arrows (toggling through solid `->>`, dashed `-->>`, solid open `->`, and dashed open `-->`) by capturing message arrow spans.
- Visual Color Swatches: Replaced the single-button colour cycler with a visual swatch picker group (`#ctx-colour-swatches`) on the context bar displaying themed color circles for real-time node fill styling.
- Sequence Note Connection Guard: Prevented connecting sequence notes (preventing invalid message routes to/from note boxes) by restricting connection capabilities.
- Improved Context Bar Discoverability: Modified context bar buttons (Connect, Duplicate, Group, Arrange) to be visible but disabled with tooltips indicating action requirements when selecting nodes. Edge selection keeps only edge-relevant actions.
- Keyboard Duplicate Support: Added keyboard shortcut `d`/`D` in the diagram navigator to duplicate selected nodes, including selection state synchronization with the canvas.
- Unified local history manager: Replaced independent text history and overlay history with a unified undo/redo manager. All user actions (text typing, canvas dragging, programmatic node/edge additions, renames, deletes, styling, and grouping) are stored in a single unified history stack. Keyboard shortcuts (Control/Meta+Z and Control/Meta+Shift+Z) trigger a single step in this unified stack, restoring both text source and overlay coordinates simultaneously, and trigger a canvas repaint. Also wrote a comprehensive E2E test verifying this unified behavior across mixed edits.
- Examples framing: Upgraded the default flowchart example `SAMPLE` from a toy 4-node diagram to a rich request-processing workflow using built-in system and security icons, while carefully retaining the original 4-node/4-edge geometry to ensure backward compatibility with all viewport coordinate-based E2E tests. Relabeled the two BPMN examples to "Flowchart — order to cash" and "Flowchart — incident response" in the dropdown, framing them as flowcharts (since they parse as `flowchart TD`). Updated the Vitest golden snapshot integration test for flowcharts accordingly.
- Overlay reload identity similarity check (IO-02 residual): Implemented a Jaccard similarity comparison between a diagram's topology/features (the diagram family, node IDs, and edge connections) and the identity stored in the layout overlay. The overlay's JSON wire shape now carries an optional `identity` string array. If the similarity between the current diagram's features and the stored identity is below 50% (such as when manually pasting a completely different diagram, even if it reuses some ID names like `A` and `B`), the stale overrides and groups are pruned and cleared to prevent layout leaking. Created a Playwright E2E spec verifying this behavior.
- Navigator double-announce fix: Added an `onFocusChange` callback to the keyboard navigator's dependencies in `navigator.ts` and `main.ts`. When the navigator gains focus, it temporarily sets the `aria-live` attribute of `#task-status` to `"off"`, preventing double-announcements (from both `#diagram-live` and `#task-status`) when arrowing through selection items. When focus leaves the navigator (blur), `aria-live` is restored to `"polite"`, ensuring full accessibility.
- Connect over-chains capping: Restricted the chain-connect action (3+ selections) to exactly 2 nodes for the `gitGraph`, `mindmap`, and `timeline` families. For these families, selecting 3+ items disables the Connect button and displays an informative tooltip ("select exactly two nodes") to prevent semantically invalid or confusing multi-connections. Wrote a Playwright E2E spec verifying this capping behavior.
- High-contrast media query support: Added support for the `@media (prefers-contrast: more)` query in `index.html`. It overrides border and soft-ink tokens in both light and dark modes with higher contrast values (`--line`, `--line-strong`, and `--ink-soft`), improving visibility for users requesting higher contrast without browser forced-colors active.
- Arrange menu focus & key navigation: Implemented focus management for the Arrange dropdown. Opening the menu (from either the toolbar `#arrange` or on-canvas `#ctx-arrange`) moves focus to the first menu item. An active opener reference is tracked, and focus is restored to the actual opener upon closing the menu (e.g. when pressing Escape or activating an item). Also added ArrowUp/ArrowDown key down navigation inside the Arrange menu.
- Optimal mount point edge routing: Re-routed edge connectors to start and end at the closest node boundaries (mount points: top, bottom, left, right) instead of the node centers for the `c4`, `network`, and `mindmap` diagram families. A new helper function `optimalMountPoints` calculates the closest pair of boundary mount points between two node bounding boxes to ensure arrowheads and lines do not overlap or intersect the node bodies. Updated integration snapshots to match.
- Edge label obstacle avoidance: Fixed edge labels on C4 and Network diagrams landing on skipped-over nodes. Labeled edges in `c4.ts` and `network.ts` now initialize with a non-null `labelPos` (the midpoint of their endpoints' centers) instead of `null`. This allows `routeSpread` to calculate a clean spread `labelPos` and enables `decollideEdgeLabels` to actively de-collide and nudge the labels off of intermediate nodes (obstacles).
- gitGraph node delete: Added support for deleting commits and branch lanes in gitGraph diagrams. Extended `GitGraphSource` to track commit and branch statement text spans during parsing. Created two new builder functions, `deleteGitCommit` and `deleteGitBranch` (which also deletes commits belonging to the deleted branch), and wired them up to the canvas and keyboard delete handlers in the application shell. Updated existing tests to verify successful deletion.
- DOT two-way editing: Implemented `parseDotWithSource` to build a precise `SourceMap` during Graphviz DOT parsing, capturing node identifiers, labels, declarations, and bracketed attributes, as well as edge arrow operators and attributes. Integrated this source map with `relabelNode` and `reshapeNode` to patch the original DOT source syntax instead of injecting flowchart syntax, and ungated all canvas/keyboard edit affordances (place, connect, delete, duplicate, shape cycling) for DOT imports. Added comprehensive integration tests.
- Smart auto-routing: Added a "Reroute" button to the selection context bar on the canvas, allowing users to cycle through alternative, obstacle-avoiding A* route options for square and curved edges. This cycles a stored `routeOption` index which A* uses to select alternative mount point combinations around obstacles. Applied trunk/bus routing automatically in `layoutDiagram` for all spread-based families (network, cloud, block, c4).
- Demo parity guard: upgraded `test/integration/examples.test.ts` from parse-only to parse → layout →
  `toDisplayList` → `toSvg` for every Examples menu entry, and added explicit assertions that
  `network` and `cloud` remain in the catalog.
- Previously cleaned up the public cloud demo example icons by replacing forced vendor logo tiles with
  internal architecture placeholders; this has since been superseded by the current vendor-icon cloud
  starter.
- Reduced cloud starter edge congestion by keeping representative cross-tier links instead of routing
  every service to every downstream dependency; the example still shows edge/routing/service/data/
  identity tiers without overloading the public demo rendering.
- Simplified the public network starter to one representative edge per tier (Internet → DMZ → app →
  data) and verified the local before/after screenshot no longer shows the previous parallel web and
  replica routes crossing through the whole canvas.
- Hardened edge-style cycling after the pre-push Playwright gate caught repeated `S` keypresses stopping
  at the open-arrow token; the app now reads the current arrow token from the editor source span before
  choosing the next style.
- Added a visual-structure guard to the Examples menu integration test: every starter must now avoid
  routing edges through container title labels in addition to parsing, laying out, lowering to display
  commands, and exporting as SVG.
- Audited the local demo screenshots for every starter and trimmed the public cloud and BPMN-style
  workflow sources: cloud now keeps only meaningful grouped tiers, while the workflows are single-pass
  readable starters rather than loop-heavy routing stress fixtures.
- Gated side-centre mount snapping in the playground display path: ELK/compartment box families pass the
  new `snapToMountPoints` option through `applyOverrides`/`applyStyles`, while cloud/network/C4/block
  keep their first-class spread/trunk routers and sequence/state/gitGraph/timeline/mindmap/pie/gantt
  keep their family-specific anchors. Refreshed pipeline goldens to pin the current before/after
  geometry.
- Hardened the UI e2e gate after pre-push attached to an unrelated server on the shared preview port:
  `playwright.config.ts` now owns fresh Vite and collab-relay servers instead of reusing existing ones.
