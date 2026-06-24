# @m/app (playground) — do next

- **Manipulation-breadth (from the BPMN/multi-family bug audit) — landed.** Flagship: subgraph edge
  routing + occlusion; uniform connect gating; flowchart/BPMN node glyphs + theme-aware line-art. Then:
  - *(done)* **A4 — pie manipulable.** `layoutPie` emits an invisible `marker` SceneNode per slice; the
    `PieSource` is wired into `renderFromText` with relabel + delete arms (slices select / relabel / delete).
  - *(done)* **A3 — sequence actor drag.** `applyOverrides` now blend-translates a crossing edge's
    waypoints by a position-weighted mix of the endpoints' deltas (instead of collapsing to a straight
    border line), so message rows + routed bends survive a one-endpoint move.
  - *(done)* **B3 — add/duplicate across families.** `familyAffordances.canAddNode` + `appendNode` give
    Add/Duplicate to flowchart/block/network/sequence; gated families show a reason. (Place + shape-cycle
    stay flowchart-only; c4/cloud/er/class — typed/nested node decls — remain gated.)
  - *(done)* **B6 — block orthogonal edge routing**, via a shared `core/route.ts orthogonalRoute` (also
    used by cloud).
  - *(done)* **add-node now covers all nine graph families** (flowchart/block/network/sequence/er/class/
    state/c4/cloud); *(done)* provenance caveat in `source-icons.mjs`.
  - *(done)* **B4 — mindmap connect** re-parents a node (`connectMindmap`).
  - **B4 — timeline/gitGraph connect: deliberately NOT done — the connect gesture doesn't map cleanly.**
    *Timeline:* an event lives `:`-delimited on its period's line (`Parser : Flowchart : Sequence`); a
    "connect event→period" would have to splice the event token out of one line and onto another, and only
    makes sense event→period (not the symmetric node→node the gesture implies). Viable but niche — would
    want a dedicated drag-an-event affordance, not generic Connect. *gitGraph:* commits are command-
    sequential and merges are **branch**-level, so "add commit B as a parent of A" has no faithful
    single-edit representation. Recommend leaving both `connect:false` rather than bolting on a confusing
    verb. **B5 (optional):** auto-signpost the placeholder labels connect inserts (sequence/c4/er/req).

- **Miro-like round (landed).** A whiteboard tool model (`select|hand|connect|place`, V/H/C/P +
  Space-pan + Esc→select, tool-aware cursors), a floating tool palette (radiogroup, roving tabindex,
  per-family disable/fallback), a selection context mini-toolbar (thin view over existing handlers via a
  shared `CapabilityState`), the zoom cluster relocated onto the stage, and deeper two-way-edit tests.
  Remaining for a later pass:
  - *(done)* **Place beyond flowchart** — Place now drops a node (shared `appendNode` + a position
    override) for every `canAddNode` family.
  - *(done)* **Two-history undo + delete collateral loss** — `undo.spec` codifies canvas ⌘Z = overlay
    only; deleting a node that shares an edge line now re-declares the surviving endpoints (was: whole
    diagram could vanish), with an e2e.
  - **Mobile widgets (deferred — needs real device testing).** The palette + context bar are hidden
    under 760px deliberately (pointer-precision affordances). A *good* touch variant means larger targets,
    gesture handling (pinch-zoom vs pan), and reflow — verified on real devices, which can't be done from
    here. Un-hiding as a CSS tweak would be a worse experience than the deliberate hide, so this wants its
    own focused pass with device testing, not a bundled change.
- **Audit follow-ups (omnibus pass).** From the multi-dimension UX/architecture audit, the safe and
  high-value findings landed in this change (family-capability gating, fail-loud label validation,
  layout-preserving text edits, share-carries-overlay, a11y naming, platform-aware shortcut hints,
  in-app syntax reference, self-healing collab transport, single-pass parse + frame memos, and a first
  decomposition of `main.ts` into `pdf.ts`/`raster.ts`/`platform.ts`/`syntax-reference.ts`). Remaining,
  deliberately deferred:
  - *(done)* **`main.ts` split.** The `installX(deps)`/`createX(deps)` pattern lifted the cohesive
    concerns into focused files: `image-export.ts`, `minimap.ts`, `navigator.ts`, `persistence.ts`,
    `theme.ts` (`main.ts` 4099 → ~3.5k). Each landed as its own e2e-verified step.
  - *(done)* **Render debounce.** Leading-edge: the first edit in a burst renders immediately (so a
    single edit + the e2e harness stay responsive), then a cooldown coalesces the rest into one trailing
    render of the *live* editor text (never a stale captured snapshot — the original desync). Source
    persists immediately (non-debounced), and a second `renderSeq` guard after the icon-raster await
    blocks a stale paint. Full e2e re-run green.
  - **Incremental edge-marker rebuild (perf).** Keep display-list commands for unchanged edges and
    recompute only edges whose endpoints are in the override delta — but home the incremental helper in
    the renderer core and justify it with a real perf trace first, not structural evidence.
  - **WS auth connect-ticket.** Replace the `?token=` query (logs/history exposure) with a short-lived
    connect ticket from an HTTP endpoint; see `modules/collab/DO_NEXT.md`.
  - **On-surface family hints (touch).** The Connect/Add/Relax "why-disabled" reasons are on hover
    (title) + the capability record; surface them in the always-visible task status for touch/keyboard
    too (kept out of this pass to avoid churning the task-HUD e2e copy).
- *(in progress — Phase 2)* **Collaborative editor (Yjs CRDT).** Phase 1 (in-memory CRDT, dev
  transport, source binding, presence) is feature-complete. The `OverlayDoc` port lives in
  `@m/contracts`; `@m/collab` provides the Yjs session. Behind a **default-off `?collab`** flag the app
  connects to the dev relay (`make collab-server`) and binds the editor to the source `Y.Text` via
  `collabSession.sourceBinding()`: two tabs on `?collab&room=…` edit **both the overlay and the diagram
  text** live, each re-deriving locally. `createEditor` gained an `extra`-extensions hook + a
  `textHistory` flag (collab drops CM's own history so Yjs owns ⌘Z); collab mode seeds the room if empty
  and doesn't clear the shared overlay on a text edit. It also labels the client (`setLocalUser`) so
  **remote cursors** render in peers' editors. Four Playwright specs cover the single-tab Yjs path,
  two-tab overlay convergence, source sync, and presence. **Phase 1 is feature-complete.** Phase 2
  (server-side) added durable persistence, Auth0 verification, and rooms + RBAC; the app now also
  **reflects the role** — a viewer's editor + canvas are read-only (the relay sends the role as a
  control frame). **Next (Phase 2 cont.):** the browser Auth0 login + the production store. See
  `modules/collab/DO_NEXT.md` + `docs/collab-editor-plan.md`.
- *(done)* **Collaborative editor — Phase 0 (the seam, no infra).** Extracted the sidecar overlay
  state (overrides + groups + undo/redo history + persistence) behind an `OverlayDoc` document-model
  interface in `src/document-model.ts`; `createLocalDocument` is the single-user, localStorage-backed
  implementation, and `main.ts` reads/mutates the overlay only through that seam. This mirrors how the
  source text already sits behind the `Editor` interface (`src/editor.ts`). Pure refactor —
  behavior-neutral (the then-current Playwright suite was green). A future collaborative backend plugs in as a
  second `OverlayDoc` implementation (Yjs-backed, edits broadcast via the injected `save` sink)
  **without touching call sites**. Full phased plan in [`docs/collab-editor-plan.md`](../../docs/collab-editor-plan.md)
  and the root `PLAN.md` Future bets; this is **Phase 0 of 4**.
  - **Phase 1:** done — Yjs in-memory CRDT, dev transport, source binding, and presence.
  - **Phase 2:** in progress — persistence, Auth0 handshake, rooms/RBAC, and role-aware UI are in;
    browser login and the production store remain.
  - **Phase 3:** pub/sub fan-out, audit export, observability/SLOs, offline buffer, compaction, and
    compliance hooks.
- *(done)* Swapped the textarea for **CodeMirror 6**: family-aware syntax highlighting, and the
  parser's `line:col` parse error is mirrored inline as a lint diagnostic (gutter marker + underline
  + hover message) on top of the existing click-to-locate. `main.ts` talks to a small `Editor`
  interface (`src/editor.ts`) so CodeMirror types never leak into the app; e2e drives it through a
  `window.__editor` handle (`e2e/support/source.ts`) since `.fill()`/`toHaveValue()` only work on a
  `<textarea>`.
- Add HTML-in-Canvas feature detection and renderer-backend selection.
- *(done)* GitHub Pages demo deployment: root Pages is reserved for presentation content, `/demo/`
  hosts the backend-free playground build, and `/docs/` + `/storybook/` are reserved for later sites.
- *(done)* The production app no longer builds as one monolithic chunk: Vite manual chunking splits
  editor, pipeline, collab, icons, and the ELK layout engine. The build still reports large icon and
  layout-engine chunks, so a later startup-weight pass should use real lazy-loading or a size budget,
  not warning suppression.
- *(done)* Responsive shell polish: the topbar/workbench/status bar no longer force page-level
  horizontal scrolling on phone-width viewports; the editor and stage stack vertically, with the
  diagram sheet still scrolling inside the stage.
- Deterministic display-list goldens are wired (`test/integration/golden.test.ts`, one per family).
  Could add a *visual* pixel golden off `make shots` later, but the display-list diff already guards
  geometry without font/AA flakiness.
- *(done)* The Examples menu catalog is parse-checked directly: `src/examples.ts` feeds both the UI
  and `test/integration/examples.test.ts`, so a broken starter cannot hide behind a stale canvas.
- *(done)* Redesign the shell into a computational notebook/workbench: grouped command toolbar,
  source/input and output panels, quieter graph surface, light/dark control polish, and screenshot
  review across desktop, mobile, and dark mode.
- *(done)* Full UX review pass against `docs/user_stories.md`: regenerated a clean 33-shot journey
  set, fixed stale shot artifacts, added help-modal coverage, tightened mobile density, and polished
  help-modal readability.
- *(done)* Follow-up UX review pass with scoped agents: fixed stale selection/export states, minimap
  keyboard access, icon-drawer modality, mobile overflow, forced-colors rendering, and first-load
  parse-error recovery. Added focused e2e for each regression.
- *(done)* Task-based UX polish pass: reviewed generated screenshots plus scoped agent findings, then
  added a professional task HUD and restrained pixel/tactical chrome while keeping diagram output
  clean. Fixed edge-selection visibility, zoom-stable interaction overlays, minimap resize refresh,
  canvas cursors, and phone-width command clipping.
- *(done — already worked)* Drag-to-move spans every family: the sidecar overrides + `applyOverrides`
  are family-agnostic, so dragging any family's nodes persists and survives reload (verified + e2e).
- *(done)* Undo/redo for canvas actions (`⌘Z` / `⌘⇧Z`): an overlay-history stack covers drag,
  group/ungroup/lock, group label, and Regenerate, gated on the editor not being focused so CodeMirror
  keeps `⌘Z` for the text. Possible follow-up: a unified undo that also spans text edits.
- *(done)* The inline label editor uses the renderer's routed-polyline edge-label anchor, so editing
  a bent edge opens on the visible label location.
- *(done)* Ctrl/⌘-wheel zoom is cursor-anchored (the point under the pointer stays put) and dragging
  the empty canvas pans the stage.
- *(done)* Element grouping: sidecar model + Group/Ungroup/Lock UI, drag-the-whole-group,
  group outlines. Follow-ups: *(done — overlay persists positions + groups to localStorage)*;
  *(done — click a group outline to select the whole group)*; *(done — editable group label/title)*.
- *(done)* Connect and Delete dispatch across all six families, including C4 boundary blocks and
  sequence actors/messages.
- State diagrams now render composite/nested states, fork/join, choice, notes, distinct start/end
  markers, and side-aware notes (`left`/`right`/`over`). Connect/Delete/relabel work on real states; the
  merged `[*]` pseudo-states aren't meaningfully editable from the canvas.
- *(done)* ER renders crow's-foot cardinality end markers (per-end `EdgeEnd`) and entity attribute
  compartments (`SceneNode.rows`); the `er` example shows attribute blocks and a `25-er` shots flow
  captures it. Connect/Delete/relabel already work on entities + relationships. The shared `EndMarker`
  machinery would also serve a future class-diagram family.
- Fixed the `make shots` instrument to drive the source through the `window.__editor` handle (it
  still used `#src.fill()`, which broke after the CodeMirror migration).
- *(done)* UML class diagram family: field/method compartments + inheritance/composition/aggregation/
  association/dependency heads (reusing the `EndMarker` machinery). The `class` example shows them, a
  `26-class` shots flow captures it. Connect/Delete/relabel work on classes + relationships. Still
  (parser-led): class stereotypes (`<<interface>>`), per-end multiplicity labels, generics.
- **Accessibility arc** (keyboard diagram navigator landed). Next:
  - *(done)* announce a node's connections as you navigate.
  - *(done)* reach/focus edges from the navigator; edges are announced by endpoints, can be relabelled
    with Enter, and Delete removes the selected edge while leaving endpoint nodes intact.
  - Keyboard operation parity *(done)*: navigate · Enter relabel · Alt+Arrow move · two-step `c` connect ·
    Delete remove.
  - *(done)* Announce action outcomes via the live region: relabel, delete, connect, copy/paste,
    group/ungroup/lock, arrange, export/share, theme/sketch, and layout undo/redo.
  - Polish *(done)*: `prefers-reduced-motion` collapses all motion; a visible navigator focus ring on the
    stage; a contrast audit (every label/stroke pair clears WCAG AA, guarded by a renderer test).
  - *(done)* Help modal and icon drawer keep keyboard focus contained while open and restore focus to
    their trigger on close.

## Audit follow-ups (from the UI/UX + usability + product + security agent pass)
Fixed in the a11y/collapse PR: keyboard grouping (multi-select + g/u), navigator keeps its place +
inline-edit returns focus, cloud collapse (E), ⌘D no longer swallows the keystroke off-addNode
families, shape-cycle/Regenerate announce, #status live region, Escape closes Arrange, flowchart-
subgraph + sequence-note + parallel-edge delete corruption, icon-pack SVG XSS guard, overlay
negative-size fail-loud.
Landed in the round-2 a11y/UX PR: navigator keyboard parity (S cycles shape; F2 focuses the floating
action bar, which roves and Escapes back to the navigator) and sidecar groups as a third navigator
category (arrow to select, Enter to relabel); export/Copy disabled on an invalid source; family-aware
Group title + flowchart-only help qualifiers + the navigator keys documented; the context-bar Arrange
opens next to itself; `?ws=` origin-allowlisted. Plus boy-scout correctness — double-announce removed,
false "relabel committed" suppressed, "connect made no change" message, Relax surfaces failure +
pin-clear, labelled network/cloud edges deletable, special-state (`<<fork>>`) declarations deletable.

Still open (lower priority, each bounded):
- Keyboard resize: the task hint promises corner handles a keyboard user can't operate. Either add a
  resize-by-key or scope the hint.
- Collab hardening (defense-in-depth, before auth ships): move the WS `?token=` out of the query string
  into the first frame after open; add a `connect-src` CSP. See `modules/collab/DO_NEXT.md`.
- Icon-pack SVG blocklist misses external-subresource refs (`<image href="http…">`, `<use>`) and SMIL
  `set`; not exploitable today since pack markup is only embedded via `<image href="data:…">` (image
  mode disables scripting/fetch). Tighten to an element/attribute allowlist if it's ever inlined.
- Minimap arrow-pan has no spoken feedback (LOW; the navigator is the primary SR surface).
- (Moot) `deleteEdge` of an `A -- text --> B` inline-labelled flowchart edge: that syntax doesn't parse
  in this grammar, so the no-op is unreachable.
