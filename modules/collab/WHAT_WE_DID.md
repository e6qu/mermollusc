# @m/collab — work log

- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- Pinned `yjs` 13.6.31 in the catalog (latest stable, ~22d old — passes the ≥24h supply-chain rule).
- Built `createCollabSession` (`src/shell/session.ts`): one `Y.Doc` holding the source (`Y.Text`) and
  the overlay (overrides + groups, two `Y.Map`s). Its `overlay` implements the `@m/contracts`
  `OverlayDoc` port by reusing `@m/builder`'s pure overlay ops, writing minimal diffs into the Y.Maps,
  and materialising branded state back through `@m/builder`'s Zod `decodeOverlay` (peer data validated
  at the boundary, never trusted raw; a decode failure throws loudly). Undo/redo is a `Y.UndoManager`
  scoped to local edits; `record()` maps to `stopCapturing()` so a gesture is one undo step.
  Transaction origins (`LOCAL`/`REMOTE`/`SEED`) keep undo tracking, broadcast-without-echo, and the
  un-historied initial seed straight. Source channel + binary-sync seam (`state`/`applyUpdate`/
  `onUpdate`) and remote-change listeners exposed.
- Tests (23, green): unit overlay + undo/redo + source; integration two-peer convergence incl. a
  fast-check property that any interleaving of independent moves converges. Coverage ratchet set in
  `vitest.config.ts` (~97% stmts).
- Wired into the DAG (`builder <- collab <- app`): root `Makefile` MODULES + graph, `AGENTS.md` §4,
  root `PLAN.md`. Moved the `OverlayDoc` interface into `@m/contracts` so the local (app) and Yjs
  (collab) implementations share one port. The app constructs the Yjs `overlay` behind a default-off
  `?collab` flag.
