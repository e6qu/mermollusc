# mermollusc user stories

This document is the product contract for the playground UX, public app flows, and test coverage.
When a feature changes user-visible behavior, update the relevant story here in the same change.

## How tests use this file

- Every new user-facing feature should map to at least one story below.
- A story is covered when there is an automated assertion for the behavior, or an explicit visual
  review shot when pixels are the point of the story.
- Prefer Playwright for browser workflows, Vitest integration goldens for parser -> layout -> display
  stability, and module unit tests for parser/layout/renderer/builder contracts.
- If a story is intentionally not automated, document the reason in the story's coverage line.
- New tests should mention the story id in a nearby comment when the test name cannot make the
  relationship obvious.

Coverage labels:

- `Covered`: automated test or shot exists now.
- `Partial`: the primary path is covered, but meaningful edge cases remain.
- `Planned`: expected behavior is documented, but the implementation or test is not done.

## Personas

- **Diagram author:** writes or imports diagram text and wants a correct visual quickly.
- **Visual editor:** manipulates the canvas and expects the source text or overlay state to stay in sync.
- **Reviewer:** opens shared/exported diagrams, navigates with keyboard or assistive tech, and verifies
  the diagram without editing.
- **Power user:** uses keyboard shortcuts, examples, icon packs, exports, and interop formats.
- **Collaborator:** works in a room with live source/overlay sync, presence, and role-aware editing.
- **Maintainer:** extends diagram families without breaking strict type boundaries, docs, or coverage.

## Product principles

- Source text is authoritative for structure; canvas edits patch source text only through source spans.
- Manual geometry lives in the overlay sidecar, not the diagram text.
- Errors are visible and actionable; stale renders must not look fresh.
- Controls are family-aware: unavailable actions are disabled instead of pretending to work.
- Accessibility and keyboard parity are product behavior, not optional polish.
- Backend-free demo mode must never require or contact a collaboration relay.

## Source, Parse, And Render

| id | story | acceptance criteria | coverage |
|----|-------|---------------------|----------|
| SRC-01 | As a diagram author, I can type supported diagram text and see the canvas update. | Edits re-run parse, layout, and paint; the kind badge and status match the rendered family. | Covered: `app/playground/e2e/edit.spec.ts`, `render.spec.ts`, `test/integration/pipeline.test.ts`. |
| SRC-02 | As a diagram author, I can choose a known-good example for every supported family. | The Examples menu includes flowchart, sequence, C4, block, network, cloud, state, ER, class, requirement, gitGraph, timeline, mindmap, pie, Gantt, and DOT import. Each loads and parses. | Covered: `app/playground/test/integration/examples.test.ts`, family e2e example specs, and pipeline goldens. |
| SRC-03 | As a diagram author, I get actionable parse feedback. | Parse errors show status text with line/column, dim stale canvas, mark the editor span, and clear when fixed. | Covered: `editor.spec.ts`, malformed-family specs, parser `ParseError.positions` tests. |
| SRC-04 | As a diagram author, empty or truncated input must not crash the editor. | The app surfaces a parse error or empty scene; no uncaught exception. | Covered: `editor.spec.ts`, parser robust tests. |
| SRC-05 | As a maintainer, family geometry is stable enough to review. | Each family has deterministic display-list goldens that avoid font/antialias flake. | Covered: `app/playground/test/integration/golden.test.ts`. |

## Diagram Family Stories

| id | story | acceptance criteria | coverage |
|----|-------|---------------------|----------|
| FAM-01 | Flowchart authors can render, relabel, add, connect, delete, reshape, group, drag, resize, relax, and regenerate. | Source and overlay update according to the action; Regenerate preserves pinned overrides and clears unpinned layout state. | Covered: flowchart e2e specs, `toolbar.spec.ts`, builder patch tests. |
| FAM-02 | Sequence authors can render actors/messages and structurally edit messages/actors. | Relabel patches actor/message source spans; Connect inserts a message; Delete removes actors/messages safely. | Covered: `sequence.spec.ts`, `sequence-edit.spec.ts`, `structural-families.spec.ts`. |
| FAM-03 | C4 authors can render nested boundaries, descriptions, relations, and edit structure. | Optional descriptions render as secondary labels; Connect inserts `Rel`; Delete removes leaf or boundary blocks and incident relations. | Covered: `c4.spec.ts`, `c4-edit.spec.ts`, `structural-families.spec.ts`. |
| FAM-04 | Block authors can render grids and edit labels/links. | Columns shape the grid; relabel and link operations preserve parseability. | Covered: `block.spec.ts`, `block-edit.spec.ts`, parser/layout block tests. |
| FAM-05 | Network authors can render kinded devices with glyphs and undirected links. | Built-in glyphs resolve; icon overrides resolve or fail loudly; Connect/Delete use network syntax. | Covered: `network*.spec.ts`, icon/parser tests. |
| FAM-06 | Cloud authors can render nested groups, service leaves, brand marks, and links. | Groups contain services; relabel spans patch labels; malformed icon refs fail loudly. | Covered: `cloud.spec.ts`, `cloud-edit.spec.ts`, parser cloud tests. |
| FAM-07 | State authors can render start/end markers, composites, fork/join/choice, and notes. | Pseudo-state roles render distinctly; notes honor `right`, `left`, and `over`; composite delete removes the whole block. | Covered: `state.spec.ts`, `delete-composite-state.spec.ts`, layout state-note test, shots `29`/`30`. |
| FAM-08 | ER authors can render entities, attribute compartments, relationships, and cardinalities. | Attributes display in rows; crow's-foot markers render at edge ends; brace-bodied delete is safe. | Covered: `er.spec.ts`, builder ER tests, renderer marker tests. |
| FAM-09 | Class authors can render UML members, stereotypes, generics, multiplicity, and relationship heads. | Compartments, subtitles, per-end labels, and UML arrowheads are visible and exported. | Covered: `class.spec.ts`, parser/layout/renderer class tests. |
| FAM-10 | Requirement authors can render requirement/element bodies and verb relationships. | Field keys and closed values validate; relationship verbs are editable; invalid fields fail loudly. | Covered: `requirement.spec.ts`, parser requirement tests. |
| FAM-11 | gitGraph authors can render commit history and relabel explicit commit ids. | Branch/checkout/merge commands lay out into lanes; malformed refs fail loudly. | Covered: `gitgraph.spec.ts`, parser/layout gitGraph tests. |
| FAM-12 | Timeline authors can render title, sections, periods, events, continuations, and relabel text. | Sections band periods; invalid continuation before a period is surfaced. | Covered: `timeline.spec.ts`, parser/layout timeline tests. |
| FAM-13 | Mindmap authors can render indentation hierarchy and relabel nodes. | Radial layout separates levels and sibling sectors; shape syntax maps to node shapes. | Covered: `mindmap.spec.ts`, parser/layout mindmap tests. |
| FAM-14 | Pie authors can render pies and donuts with labels, legends, and `showData`. | Non-positive slices fail loudly; donut wedges render in canvas and SVG; legend swatches stay full discs. | Covered: `pie.spec.ts`, renderer wedge tests, shot `32-pie-donut`. |
| FAM-15 | Gantt authors can render dated tasks, milestones, after-chains, exclusions, tick intervals, and edit/delete tasks. | Working days stretch bars across exclusions; task relabel/delete patches source safely. | Covered: `gantt.spec.ts`, `gantt-edit.spec.ts`, parser/layout Gantt tests. |
| FAM-16 | DOT users can import/export Graphviz-compatible graph text. | DOT import renders as flowchart; DOT export downloads a graph from the current scene. | Covered: `dot.spec.ts`, `dot-export.spec.ts`, `dot-roundtrip.test.ts`. |

## Canvas Editing And Layout

| id | story | acceptance criteria | coverage |
|----|-------|---------------------|----------|
| CAN-01 | As a visual editor, I can select nodes and edges directly on canvas. | Click selects the intended item; nodes win over nearby edges; group outlines are selectable. | Covered: hit tests, `groups.spec.ts`, navigator specs. |
| CAN-02 | As a visual editor, I can drag one or more nodes without changing source structure. | Overlay positions update; connectors re-anchor; extent grows in all directions as needed. | Covered: `drag.spec.ts`, `undo.spec.ts`, builder override tests. |
| CAN-03 | As a visual editor, I can resize a node. | Corner handles resize selected nodes, respect min size, re-anchor edges, and undo as one action. | Covered: `resize.spec.ts`, `snap.spec.ts`. |
| CAN-04 | As a visual editor, I can box-select, group, lock, move, label, and ungroup nodes. | Groups persist, lock blocks movement, labels edit, stale groups prune when source changes. | Covered: `marquee.spec.ts`, `groups.spec.ts`, `persist-overlay.spec.ts`. |
| CAN-05 | As a visual editor, I can arrange selected units. | Align/distribute operates on loose nodes or top-level groups and is undoable as one action. | Covered: `arrange.spec.ts`. |
| CAN-06 | As a visual editor, I can Connect selected nodes across editable families. | Two selected nodes create one relation; three or more selected nodes create a chain where supported; unavailable families disable controls. | Covered: `connect*.spec.ts`, `structural-families.spec.ts`. |
| CAN-07 | As a visual editor, I can Delete selected structure safely. | Deleting brace-bodied entities removes whole blocks; deleting edges preserves endpoints. | Covered: `delete*.spec.ts`, builder delete tests. |
| CAN-08 | As a visual editor, I can Relax and Regenerate layout intentionally. | Relax seeds ELK with current positions; Regenerate preserves pinned overrides and clears unpinned override state; both are undoable. | Covered: `toolbar.spec.ts`, layout relax integration tests. |
| CAN-09 | As a power user, I can use snapping guides while dragging or resizing. | Guides appear near alignment and disappear when the candidate cannot reach the snap. | Covered: `snap.spec.ts`. |

## Navigation, View, And Visual Modes

| id | story | acceptance criteria | coverage |
|----|-------|---------------------|----------|
| VIEW-01 | As a reviewer, I can zoom, fit, reset, and pan the diagram. | Zoom level is reported; Fit contains tall diagrams; cursor-anchored zoom and empty-stage pan work. | Covered: `zoom.spec.ts`, responsive stage tests. |
| VIEW-02 | As a reviewer, I get a minimap when the sheet overflows. | Minimap hides when unnecessary, shows viewport, clicks and drags pan the stage. | Covered: `minimap.spec.ts`. |
| VIEW-03 | As a reviewer, I can switch light/dark themes. | Theme changes canvas background and persists across reloads; shell controls remain readable in both modes. | Covered: `theme.spec.ts`, `theme-persist.spec.ts`, screenshot review. |
| VIEW-04 | As a reviewer, I can switch Sketch/Crisp mode. | Sketch mode remeasures with the active font and redraws hand-drawn shapes without clipping labels. | Covered: `sketch.spec.ts`, renderer sketch tests, shots `04`, `28`, `30`. |
| VIEW-05 | As a mobile user, I can use the shell on phone-width screens. | Grouped topbar/status controls wrap compactly, editor and stage stack, no page-level horizontal overflow, pan/zoom remain reachable, and the first viewport reaches the output panel. | Covered: `responsive.spec.ts`, shot `01-mobile`, screenshot review. |
| VIEW-06 | As a maintainer, visual regressions are reviewable. | `make shots` clears stale PNGs, then captures representative UI states, help/modal flows, and family polish flows. | Covered: `app/playground/e2e-shots/shots.spec.ts`. |

## Accessibility And Keyboard

| id | story | acceptance criteria | coverage |
|----|-------|---------------------|----------|
| A11Y-01 | As a screen-reader user, I can understand the canvas. | Canvas has a text alternative naming family and counts; live region announces actions. | Covered: `a11y.spec.ts`. |
| A11Y-02 | As a keyboard user, I can navigate nodes and edges. | Hidden listbox mirrors diagram items; arrows move active item; Enter relabels; Delete removes; `c` connects. | Covered: `a11y.spec.ts`. |
| A11Y-03 | As a keyboard user, I can move and select without the mouse. | `Ctrl/Cmd-A`, Escape, Alt+Arrow, and arrow nudge behave predictably and are undoable. | Covered: `keyboard.spec.ts`, `a11y.spec.ts`. |
| A11Y-04 | As a keyboard user, modal/drawer focus is contained. | Help and icon picker trap Tab, close on Escape, restore focus, and remain visually scannable. | Covered: `help.spec.ts`, `icon-picker.spec.ts`, shot `22-help`. |
| A11Y-05 | As a user with motion sensitivity, I can reduce motion. | `prefers-reduced-motion` collapses animations/transitions. | Covered: `a11y.spec.ts`. |
| A11Y-06 | As a low-vision user, labels and controls have sufficient contrast and visible focus. | Renderer palette clears contrast tests; focus rings show keyboard focus. | Covered: renderer contrast tests, `a11y.spec.ts`. |

## Persistence, Sharing, Export, And Icons

| id | story | acceptance criteria | coverage |
|----|-------|---------------------|----------|
| IO-01 | As an author, my source survives reloads. | Local source persists; a fresh context starts on the default sample. | Covered: `source-persist.spec.ts`. |
| IO-02 | As a visual editor, my overlay survives reloads when source matches. | Dragged positions and groups persist; stale overlays do not corrupt different share-link sources. | Covered: `persist-overlay.spec.ts`, builder overlay tests. |
| IO-03 | As a reviewer, I can open a shareable link. | `#src=` source wins on load and Share updates/copies the URL. | Covered: `share-link.spec.ts`. |
| IO-04 | As a power user, I can export PNG, PDF, SVG, and DOT. | Exports download files; PNG/PDF render at device resolution independent of zoom; SVG is vector. | Covered: export specs, renderer SVG/DOT tests. |
| IO-05 | As a power user, I can copy a PNG to the clipboard. | Copy writes a PNG blob or reports failure visibly. | Covered: `copy-image.spec.ts`. |
| IO-06 | As an icon user, I can load an external icon pack. | Valid packs register and re-render; malformed packs report errors without crashing. | Covered: `load-pack.spec.ts`, icons integration tests. |
| IO-07 | As an icon user, I can browse and insert icon overrides. | Picker filters by pack/category/name and inserts `icon "<pack>/<name>"` at the caret. | Covered: `icon-picker.spec.ts`. |

## Collaboration And Roles

| id | story | acceptance criteria | coverage |
|----|-------|---------------------|----------|
| COL-01 | As a collaborator, I can join a default-off collab room. | `?collab&room=...` uses Yjs overlay and source state; normal app mode remains single-user. | Covered: `collab-flag.spec.ts`, collab unit tests. |
| COL-02 | As collaborators, two tabs converge on overlay edits. | Drag in one tab appears in the other; late joiners receive room state. | Covered: `collab-sync.spec.ts`, collab convergence tests. |
| COL-03 | As collaborators, two tabs share source text. | Editing source in one tab updates editor and canvas in the other. | Covered: `collab-source.spec.ts`. |
| COL-04 | As collaborators, we see remote text presence. | Awareness relays name/color and source caret/selection. | Covered: `collab-presence.spec.ts`, collab awareness tests. |
| COL-05 | As an owner/editor/viewer, my role is enforced and reflected. | Server drops viewer document frames; app makes viewer editor/canvas read-only and restores edit controls for editor. | Covered: `collab-role.spec.ts`, relay/RBAC tests. |
| COL-06 | As an enterprise operator, auth and persistence seams are explicit. | Auth0 verifier validates tokens; file store persists room snapshots; production store remains a documented next step. | Covered: collab auth/store/relay tests. |
| COL-07 | As a Pages visitor, demo mode is backend-free. | `/demo/` runs local-only even if `?collab` is appended. | Covered by build configuration and documented Pages flow; add e2e if a regression appears. |

## API And Module Contracts

| id | story | acceptance criteria | coverage |
|----|-------|---------------------|----------|
| API-01 | As a maintainer, parser APIs fail loudly and return located errors. | Parsers return `Result`, never throw for user text; malformed source carries positions when locatable. | Covered: parser unit/integration/robust tests. |
| API-02 | As a maintainer, layout APIs fail loudly on inconsistent ASTs. | Unknown endpoints/dangling parents return `LayoutError` or throw only at impossible post-pass invariants. | Covered: layout fail-loudly tests. |
| API-03 | As a maintainer, renderer APIs are backend-consistent. | Canvas and SVG share display-list semantics for shapes, markers, labels, wedges, decorations, and origins. | Covered: renderer display/paint/svg tests. |
| API-04 | As a maintainer, builder APIs patch source safely. | Patch helpers use source spans, preserve unrelated text, and fail on unknown ids. | Covered: builder patch tests. |
| API-05 | As a maintainer, overlay APIs round-trip and decode external data. | Overlay JSON/Yjs data decodes through shared schemas; malformed payloads fail loudly. | Covered: builder overlay tests, collab session tests. |
| API-06 | As a maintainer, dependency and type boundaries stay strict. | `make check`, `tools/guard-types.mjs`, and docs-moving-with-code rules remain required gates. | Covered by `make check`, hooks, and AGENTS.md. |

## Test Coverage Backlog

- Add story-id comments to new tests when names do not clearly map to this document.
- Add a backend-free Pages demo e2e if future Pages routing or build flags change.
- Consider visual pixel goldens only for flows where display-list goldens cannot catch the regression.
- Keep `make shots` broad but non-gating; keep Playwright assertions focused and deterministic.
