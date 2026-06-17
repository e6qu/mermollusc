# @m/builder — do next

- Span-accurate delete (per-statement spans from the parser) to replace the line-based `deleteNode`/
  `deleteEdge` heuristic. Note: deleting a node mid-chain (`A --> B --> C`) is a semantic choice, not
  just a span removal — the line-based version removes the whole chain line; decide the intended
  behaviour before reworking.
- *(done)* Sidecar group labels (`setGroupLabel`) persist through the overlay codec.
- *(done)* Property coverage for `relabelNode` (span-accurate relabel, others untouched) and
  `connect` (appends exactly one edge, nodes preserved).
