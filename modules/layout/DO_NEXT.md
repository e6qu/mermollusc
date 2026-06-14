# @m/layout — do next

- Consume the `LayoutOverrides` contract: feed pinned positions to ELK as fixed coordinates
  (regenerate = unpinned only) and as soft seeds (relax).
- Take real node sizes from the renderer's text measurement instead of the char-width heuristic.
- Add property tests: children within extent, no node-box overlap, edges terminate near nodes.
- Support nested containers (subgraph / C4) via ELK hierarchy once those AST variants exist.
