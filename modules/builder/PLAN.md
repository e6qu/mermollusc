# @m/builder — plan

Hit-testing, selection, drag, and text↔diagram two-way sync.

## Responsibility

- Hit-test the rendered Scene (geometric, via `@m/std` `rectContains` and edge proximity).
- Selection + drag interactions on the canvas.
- Two-way sync between Mermaid text and the diagram.
- Family-specific structural patching for node/edge creation and deletion.

## Sync model

- **Text/CST is authoritative for structure.** Structural canvas edits (add/relabel/connect/
  delete) are applied as **range patches** to the source text via the parser's CST source spans,
  so the user's formatting, ordering, and comments survive.
- **Manual geometry lives in a sidecar overrides layer**, never in the Mermaid text (which has no
  coordinates). Each override is `nodeId → { position, size?, pinned }`.
- **Operations:**
  - *regenerate* — re-run ELK on **unpinned** nodes only; pinned nodes keep their manual position.
  - *relax* — feed manual positions to ELK as **soft seeds** and let it relax the whole graph
    around them (cleans overlaps while respecting intent).
  - *structural edit* — keep existing overrides; auto-place only newly introduced nodes.

## Public API (stable surface)

- `patchSpan`, `relabelNode`, `addNode`, `connect`, `connectUndirected`, `connectC4`,
  `connectMessage`.
- `deleteNode`, `deleteEdge`, `deleteC4`, `deleteC4Rel`, `deleteActor`, `deleteMessage`.
- `group`, `ungroup`, `setLocked`, `setGroupLabel`, and group queries over the sidecar group model.
