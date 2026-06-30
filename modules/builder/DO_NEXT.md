# @m/builder — do next

- Span-accurate delete (per-statement spans from the parser) to replace the line-based `deleteNode`/
  `deleteEdge` heuristic. *The mid-chain collateral loss is now handled app-side* (`deleteSelection`
  re-declares any survivor a shared edge line took down, via the family-agnostic `appendNode`), so the
  semantic question "deleting `B` from `A --> B --> C` keeps `A` and `C` as bare nodes" is answered. A
  parser-span rework would still be cleaner (no extra render, no re-declare round-trip), but it's no
  longer a correctness gap — lower priority now.
- Wire the app shell to call `validateLabel(label, context)` before committing every inline
  edge/element label edit (the `patchAt`/`commit` path in `beginRelabel`): flowchart/network/cloud/block
  pipe labels → `pipe`; C4 element/relation labels → `quoted`; the remaining families → `plain`. Surface
  the `PatchError` (the relabel/reshape node paths already validate internally).
- Wire `app/main.ts` to import `snapAxis` / `snapCandidates` / `SNAP_T` from `@m/builder` and delete the
  in-file copies (the core is now the single source).
- *(done)* Sidecar group labels (`setGroupLabel`) persist through the overlay codec.
- *(done)* Property coverage for `relabelNode` (span-accurate relabel, others untouched) and
  `connect` (appends exactly one edge, nodes preserved).
- *(done)* Gantt dependency-start drag support: `setGanttStartFromDay` rewrites `after ...` spans to an
  explicit date when the app has a resolved calendar day.
- *(done)* Make side-centre mount snapping an explicit `applyOverrides`/`applyStyles` option so the app
  can gate it per family.
