# @m/renderer — bugs

_None known._

## Resolved

- ~~**`toDot` exported pie markers as orphan boxes and grew `cluster_` on every round-trip.**~~ Fixed
  (export/IO audit) — `toDot` emitted pie slices (invisible `marker` nodes) as disconnected boxes (the
  comments even claimed a pie "exports as an empty graph", which was false), and prefixed a container id
  with `cluster_` unconditionally, so a re-exported DOT import grew `cluster_cluster_…` each round. Now
  marker nodes are skipped and the prefix isn't doubled when the id already starts with `cluster`.
  Guarded by a DOT export→import→export fixed-point fuzzer + deterministic pie/cluster tests.

- ~~**Dark Gantt `sectionAlt` band was invisible.**~~ Fixed (contrast audit) — `bandFill` returned the
  dark background colour (`#0f172a`) for `sectionAlt`, so alternating zebra stripes and the section
  banding conveyed nothing in dark mode. The three band fills are now mutually distinct and each differs
  from the background (still subtler than a node fill so the bars stay dominant). Guarded by a unit test.

Checked while exporting routed edge-label anchor geometry for host overlays.

Checked while adding the optional C4 element description.
Checked while adding edge-label background plates (legibility polish).
Checked while layering edges beneath nodes (link occlusion polish).
Checked while wobbling sketch-mode edge markers + verifying compartments in dark/sketch (no bug found).
Checked while adding state marker commands and sketch box fills.
Checked while adding donut wedge rendering.
Checked while splitting renderer route geometry into `src/core/path.ts` and preserving crossing-hop
coverage.
Checked while widening edge-label plates in the canvas and SVG backends.
