# @m/layout — do next

- Wire relax/regenerate buttons in the app (pass the current scene positions as the seed).
- Refine regenerate to re-layout only *unpinned* nodes (ELK can't cleanly fix a subset; needs a
  per-node fixed-position approach or post-pass).
- *(done)* The app now measures with the *active* theme font (incl. the wider sketch font) and
  re-lays out when the Sketch toggle flips, so labels stay inside their boxes in both modes.
- Extend property tests: no node-box overlap, edges terminate near nodes (ids-preserved + boxes-
  within-extent are covered for block/network grids and the ELK flowchart path).
- Support nested containers (subgraph / C4) via ELK hierarchy once those AST variants exist.
