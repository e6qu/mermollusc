# @m/contracts — do next

- *(done)* All fifteen diagram families have AST variants (flowchart, sequence, C4, block, network,
  cloud, state, ER, class, requirement, gitGraph, timeline, mindmap, pie, gantt) — see STATUS.md.
- *(done)* `LayoutOverrides` is the shared sidecar contract (`nodeId → { position, size?, pinned }`);
  `OverlayDoc.replaceOverrides` lets regenerate replace only the unpinned portion of the map.
- *(done)* Type-level tests (`expectTypeOf`) pin `DiagramAst` narrowing + closed-union `kind` (test/unit/ast-union).
- Keep AST and SceneGraph IR stable — downstream modules depend on these shapes.
- *(done)* Sidecar groups include a required label for editor-owned group titles.
- *(done)* State-specific Scene rendering intent is explicit through `SceneNode.role`, instead of
  overloading generic shapes for initial/final/fork/join/note glyphs.
- *(done)* State notes now carry `side` (`right`/`left`/`over`), and pie wedges carry `innerRadius` for
  donut slices.
- *(done)* Architecture scene nodes carry semantic accents, and Gantt source maps expose full start-field
  spans for drag-to-date edits.
- *(done)* State diagrams carry explicit direction, and edge styles carry relative label positions for
  movable labels that survive rerenders.
