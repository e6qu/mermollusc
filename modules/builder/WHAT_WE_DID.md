# @m/builder — work log

- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- core: `hitTest` (pure) — node bounds via `rectContains`, edge proximity via point-to-segment
  distance, nodes preferred over edges. 4 unit tests.
- core: pure selection model — `Selection`, `selectOnly`, `toggle`, `isSelected`. 4 unit tests.
- core: sidecar overrides — `moveNode`/`clearOverride`/`applyOverrides` over the `LayoutOverrides`
  contract; `applyOverrides` repositions boxes immediately, edges re-route on relayout. 4 tests.
- core: `relabelNode` (two-way) — rewrites only a node's label span via the parser `SourceMap`
  (bracketed splice / bare wrap), preserving the rest of the file. 3 tests (round-trip via reparse).
- core: `patchSpan` primitive + structural appends `addNode` / `connect` (append a node/edge line,
  reparse-verified). 3 tests.
- core: `deleteNode` (line-based, bracket-aware — strips labels before matching the id so a label
  mention can't false-match; removes the decl + referencing edge lines). 2 tests.
- Added property-based tests (fast-check): `patchSpan` splices exactly the span and round-trips,
  `moveNode`+`applyOverrides` repositions exactly one node, `addNode`/`deleteNode` text invariants.
  +5 tests.
- Added `deleteEdge` (line-based, like `deleteNode`): removes a standalone `from <arrow> to` line
  (ident tokens === `[from, to]`), sparing declarations and multi-hop chains. The app's Delete key
  now removes a selected edge too. +2 tests.
- Added parser-backed property coverage for the two-way patches: `relabelNode` rewrites exactly the
  target node's label (re-parsing confirms the new label and every other node unchanged), and
  `connect` appends exactly one edge with the requested from/to/kind while preserving the nodes.
  +2 property tests (29 total).
- `applyOverrides` now keeps connectors attached when nodes move (no re-layout): an edge whose
  endpoints both shift by the same delta (a group dragged as one) has its route translated so its
  shape is preserved; an edge crossing the moved set is re-anchored to a straight line between the
  boxes' borders (`borderPoint`). It also grows the scene extent to include moved nodes so a node
  dragged past the original bounds isn't clipped by the stage. +2 unit tests (boundary re-anchor,
  group translate).
- Sidecar element-group model (`@m/contracts` `Group`/`Groups` + builder ops): `group`/`ungroup`/
  `setLocked` and queries `parentOf`/`leafNodes`/`topGroupOfNode`/`pathLocked`/`topGroups`. Groups are
  family-agnostic, arbitrarily nestable, and member-ordered; `ungroup` splices a dissolved group's
  members back into its parent in place ("unbundled in the same order"), or frees them at top level.
  Move-only lock (`pathLocked` reports a lock anywhere up a node's chain). +9 unit tests
  (nesting, order-preserving ungroup, lock propagation, node/group id disambiguation). Pure core,
  no UI yet — the app wiring (group/ungroup/lock affordances, move-whole-group, outline) is next.
- Overlay codec (shell): `serializeOverlay` / `decodeOverlay` round-trip the editor's sidecar
  (`LayoutOverrides` + `Groups`) through JSON, decoding untyped storage input via Zod and re-branding
  ids/points at the boundary (the `decodePack` pattern). Adds `zod` to builder deps. +2 unit tests
  (round-trip incl. nested locked group; fails loud on malformed input).
- `connectUndirected(text, from, to)` appends an undirected link (`from -- to`) for the network/cloud
  families; `deleteEdge`/`deleteNode` already work for them (token-based, operator-agnostic). +1
  integration test (the appended link parses as a network link).
- `connectC4` (appends `Rel(from, to, "")`) and `connectMessage` (appends `from->>to: message`)
  complete edge-creation for the last two families (C4 relations, sequence messages); both insert a
  default label the user can rename. +2 integration tests (each appended edge parses back to a rel /
  message).
- Added C4 and sequence delete patchers: `deleteC4` removes a leaf element or a whole boundary block
  plus any relations touching removed/nested elements; `deleteC4Rel` removes a matching relation;
  `deleteActor` removes a participant declaration and messages touching it; `deleteMessage` removes
  the first matching actor-to-actor message. +5 parser-backed integration tests.
- Added group labels to the sidecar group model via `setGroupLabel`; overlay serialization/decoding
  persists the required label field with every group. +2 unit cases.
- Added `resizeNode(overrides, id, position, size)` — the resize counterpart to `moveNode` (which
  only sets position): resizing from a corner moves the origin too, so both are pinned together.
  `applyOverrides` already honoured `NodeOverride.size`, so this completes manual node sizing. +1 unit.
- Added `pruneGroups(groups, liveNodes)`: drops group members for scene nodes no longer present (and
  empties that cascade out), so a sidecar group can't outlive the diagram it described — fixing stale
  groups that survived a text edit and could resurrect onto reused ids. Returns the input unchanged
  (by identity) when nothing's dead. +2 unit cases.
- Added `connectEr` (appends `from ||--o{ to : relates`, a default one-to-many) and `deleteErRel`
  (removes the first ER relationship line between two entities) so ER diagrams get canvas
  Connect/Delete like the other families. +1 integration case.
