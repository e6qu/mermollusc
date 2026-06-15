# @m/layout — do next

- Wire relax/regenerate buttons in the app (pass the current scene positions as the seed).
- Refine regenerate to re-layout only *unpinned* nodes (ELK can't cleanly fix a subset; needs a
  per-node fixed-position approach or post-pass).
- Take real node sizes from the renderer's text measurement instead of the char-width heuristic.
- Add property tests: children within extent, no node-box overlap, edges terminate near nodes.
- Support nested containers (subgraph / C4) via ELK hierarchy once those AST variants exist.
