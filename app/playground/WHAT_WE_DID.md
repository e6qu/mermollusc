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
  containers + service-kind glyphs. +1 Playwright flow.
- Cloud two-way: the source-capture switch keeps a `CloudSource` (via `parseCloudWithSource`);
  double-click a group, service leaf, or labelled link → `patchSpan` rewrites its label span. +1 flow.
