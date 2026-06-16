# @m/layout — do next

- Wire relax/regenerate buttons in the app (pass the current scene positions as the seed).
- Refine regenerate to re-layout only *unpinned* nodes (ELK can't cleanly fix a subset; needs a
  per-node fixed-position approach or post-pass).
- Measure with the *active* theme font (incl. sketch) rather than the fixed base font, and re-layout
  on font change. (Injectable `MeasureText` is wired; the app uses base 14px sans-serif.)
- Extend property tests: no node-box overlap, edges terminate near nodes (ids-preserved + boxes-
  within-extent are covered for block/network grids and the ELK flowchart path).
- Support nested containers (subgraph / C4) via ELK hierarchy once those AST variants exist.
