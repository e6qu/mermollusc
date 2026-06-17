# @m/layout — do next

- Wire relax/regenerate buttons in the app (pass the current scene positions as the seed).
- Refine regenerate to re-layout only *unpinned* nodes (ELK can't cleanly fix a subset; needs a
  per-node fixed-position approach or post-pass).
- *(done)* The app now measures with the *active* theme font (incl. the wider sketch font) and
  re-lays out when the Sketch toggle flips, so labels stay inside their boxes in both modes.
- Extend property tests: no node-box overlap, edges terminate near nodes (ids-preserved + boxes-
  within-extent are covered for block/network grids and the ELK flowchart path).
- *(done)* Flowchart `subgraph` nesting lays out via ELK hierarchy (compound nodes + absolute-coord
  flattening). C4/cloud use their own pure nested-box layout.
- Make the pure layouts (`sequence`/`cloud`/`c4`) total-by-`Result` (or restructure so the lookups
  can't miss) to drop the remaining `?? default` fallbacks that currently defend against an
  inconsistent hand-built AST. Today they return a `Scene` directly, so they can't fail loudly.
