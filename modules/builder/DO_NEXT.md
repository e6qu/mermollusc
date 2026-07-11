# @m/builder — do next

- Span-accurate delete (per-statement spans from the parser) to replace the line-based `deleteNode`/
  `deleteEdge` heuristic. *The mid-chain collateral loss is now handled app-side* (`deleteSelection`
  re-declares any survivor a shared edge line took down, via the family-agnostic `appendNode`), so the
  semantic question "deleting `B` from `A --> B --> C` keeps `A` and `C` as bare nodes" is answered. A
  parser-span rework would still be cleaner (no extra render, no re-declare round-trip), but it's no
  longer a correctness gap — lower priority now.
- *(done)* App inline relabel commits call `validateLabel` before splicing source spans, including
  timeline/gantt colon-delimited labels, and surface `PatchError` messages in the status HUD.
- *(done)* `app/main.ts` imports `snapAxis` / `snapCandidates` / `SNAP_T` from `@m/builder`; the core is
  the single source for alignment snapping.
- *(done)* Unit coverage for `applyStyles(scene, emptyEdgeStyles, emptyNodeStyles, true)` guards the
  no-style branch so it continues to honor mount snapping.
- *(done)* Sidecar group labels (`setGroupLabel`) persist through the overlay codec.
- *(done)* Per-entry style encoders (`encodeEdgeStyleEntry`/`encodeNodeStyleEntry`) exported through the
  barrels for `@m/collab`'s style Y.Map sync, with a codec round-trip unit test.
- *(done)* Property coverage for `relabelNode` (span-accurate relabel, others untouched) and
  `connect` (appends exactly one edge, nodes preserved).
- *(done)* Gantt dependency-start drag support: `setGanttStartFromDay` rewrites `after ...` spans to an
  explicit date when the app has a resolved calendar day.
- *(done)* Make side-centre mount snapping an explicit `applyOverrides`/`applyStyles` option so the app
  can gate it per family.
- *(done)* Persist moved edge-label position as `EdgeStyle.labelT` and apply it after route changes.
