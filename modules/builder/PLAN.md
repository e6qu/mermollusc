# @m/builder — plan

Hit-testing, selection, drag, and text↔diagram two-way sync.

## Gantt source rewrites

- Keep Gantt drag helpers pure and source-span based. Explicit dates shift in place; dependency starts
  materialize through `setGanttStartFromDay`.

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
- **Manual edge-label placement lives in sidecar edge styles** as a relative route ratio, so label
  positions survive reroutes and regenerate without polluting the Mermaid source.
- Box-style mount snapping is an explicit display option at the override/style boundary, and that option
  applies even when the sidecar has no edge/node style entries.
- **Operations:**
  - *regenerate* — re-run ELK on **unpinned** nodes only; pinned nodes keep their manual position.
  - *relax* — feed manual positions to ELK as **soft seeds** and let it relax the whole graph
    around them (cleans overlaps while respecting intent).
  - *structural edit* — keep existing overrides; auto-place only newly introduced nodes.

## Public API (stable surface)

- `patchSpan`, `relabelNode`, `reshapeNode`, `addNode`, `connect`, `connectUndirected`, `connectC4`,
  `connectMessage`.
- `validateLabel(label, context)` — the pure label-safety guard the shell calls before committing an
  inline edge/element/node-label edit (`context` ∈ `flowchartBracket` | `pipe` | `quoted` | `colon` |
  `plain`).
- `deleteNode`, `deleteEdge`, `deleteC4`, `deleteC4Rel`, `deleteActor`, `deleteMessage`.
- `snapAxis`, `snapCandidates`, `SNAP_T` — alignment-snap geometry for drag/resize (pure, in core).
- `applyOverrides(scene, overrides, snapToMountPoints?)` and `applyStyles(..., snapToMountPoints?)` —
  display-only scene geometry updates, with side-centre mount snapping opt-in for box-style families and
  edge-label ratios applied after reroutes.
- `group`, `ungroup`, `setLocked`, `setGroupLabel`, and group queries over the sidecar group model.
