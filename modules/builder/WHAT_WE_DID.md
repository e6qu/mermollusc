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
- Migrated the hit-test/overrides scene fixtures to the new `SceneNode.rows` + `SceneEdge.fromEnd/toEnd`
  contract (the builder core is scene-shape-agnostic, so no source change — fixtures only).
- Added `connectClass` (appends `from --> to`, a plain association the user re-types into
  inheritance/composition/etc.) and `deleteClassRel` (removes the first class relationship line
  between two classes, keyed on the UML operator) so class diagrams get canvas Connect/Delete. Also
  re-added `rowDivider: null` to the migrated fixtures. +1 integration case.
- Added `connectRequirement` (appends `from - satisfies -> to`, a default verb the user re-types) and
  `deleteRequirementRel` (removes the first `a - verb -> b` line between two entities) so requirement
  diagrams get canvas Connect/Delete. +1 integration case.
- Fixed external-review P1 (Delete corrupting brace-bodied entities): added `deleteErEntity` /
  `deleteClassEntity` / `deleteRequirementEntity` over a shared `deleteEntityWithBody` helper that
  removes the entity's `{ … }` block (brace-depth tracked) — or bare/`class`/`<kind>` decl line, and a
  class `Foo : member` shorthand — plus every relationship line incident to it. Previously these fell
  through to line-based `deleteNode`, orphaning body rows + the closing `}`. +3 integration cases
  (block + incident rels gone, result re-parses).
- Fixed external-review P1 (extent only grew right/down): `applyOverrides` now emits the true bounds —
  a negative extent *origin* (not just grown width/height), including edge waypoints — so a node
  dragged past the top-left is no longer clipped. +1 unit test (negative drag → negative origin).
- Polish/harden: closed the last piece of the brace-bodied-delete P1 — composite `state X { … }`.
  Added `deleteStateEntity`, which reuses the shared `deleteEntityWithBody` brace-matcher with
  state-specific declaration/transition/note recognisers (`state id`, `state "…" as id`, `id : desc`,
  `a --> b`, `note … of id`), so deleting a composite removes its whole block + incident transitions +
  description + note and the source stays parseable. The app's `removeNode` now routes `state` here
  instead of falling through to line-based `deleteNode`. +2 integration cases (composite block gone +
  re-parses; non-composite drops only its lines).
- Polish/harden: extracted the overlay's per-entry wire encoders — `encodeOverrideEntry` /
  `encodeGroupEntry` — as the single source of truth for its on-the-wire shape. `serializeOverlay` (JSON
  persistence) and `@m/collab`'s Y.Map sync now both encode through them, so the two can't drift; each
  carries a `satisfies Record<keyof NodeOverride|Group, unknown>` guard that turns a newly-added domain
  field into a compile error rather than a silent wire-drop. +1 unit test (per-entry shape + round-trip).
- `applyOverrides` rebuilds `SceneEdge.waypoints` (now `TwoOrMore<Point>`) by destructuring the ≥2 input
  and shifting each point, so the offset route stays a `TwoOrMore` by construction.
- Added `reshapeNode` (two-way edit): rewrites a flowchart node's whole declaration span (`A[x]` →
  `A((x))` etc.) to a new shape via an exhaustive `wrapShape`, keeping the label; a bare node's id
  becomes its label. +integration tests (all five shapes round-trip through re-parse; bare-node case).
- Robustness: `leafNodes` flattens a nested group's leaves with a loop, not `push(...leafNodes(...))` —
  a spread of a very large nested group would exceed the argument-count limit and throw. +unit test
  (a 200k-leaf nested group flattens without overflow).
- Added `deleteGanttTask(text, span)` — removes the whole source line containing a label span. Keyed by
  span (not id) because a Gantt task may be auto-numbered (`t0`…) and carry no id in the text, which the
  id-matching `deleteNode` can't find. +2 integration tests (auto-id task; exact line removal).
- Closed a closing-delimiter corruption in the inline relabel/reshape path: a label containing the
  target shape's own closer (`]`/`)`/`}`) — or a newline — used to splice straight into the bracket and
  write un-parseable source. `relabelNode`/`reshapeNode` now validate first (reshape against the target
  shape's closer; relabel against every bracket closer, since the span doesn't record the existing
  shape) and return a loud `PatchError` instead of corrupting the text. +property test (`relabelNode`
  on hostile labels either round-trips through parse or returns err — never silently corrupts).
- Added `validateLabel(label, context)` — a pure/total core guard the app shell calls before committing
  an inline edge/element label edit (which previously spliced raw text between delimiters with no
  check). `context` is a closed union — `flowchartBracket` (`]`/`)`/`}`), `pipe` (`|`, for
  flowchart/network/cloud/block edge labels), `quoted` (`"`, for C4), `plain` (only `\n`) — each
  rejecting the delimiter that would terminate the token early, plus `\n` everywhere. `patchSpan` stays
  pure (validation is a separate gate). +property tests (per-context terminator rejection; safe labels
  pass in every context).
- Moved the alignment-snap geometry out of `app/main.ts` into `src/core/snap.ts` (verbatim, semantics
  preserving): `snapAxis(edges, targets)` → the closest candidate shift within `SNAP_T` (first-seen
  wins on a tie) and `snapCandidates(nodes, exceptId)` → the other nodes' left/centre/right xs +
  top/middle/bottom ys; `SNAP_T` re-exported. Pure core, re-exported through the builder barrel. +prop
  tests (snap never exceeds `SNAP_T` and lands the edge exactly on the line; globally-closest
  first-seen-wins tie-break; no candidate ⇒ `{ delta: 0, line: null }`; `snapCandidates` excludes the
  dragged node and emits three lines per other axis).
