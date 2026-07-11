# @m/renderer — bugs

_None known._

## Resolved

- ~~**Canvas donut slices filled the hole.**~~ Fixed — the painter's annular-sector path swept the
  inner arc forward (clockwise), so each slice's path wound across the hole and the last slice painted
  a solid disc over it; the SVG backend (evenodd annulus) was already correct. The inner arc now
  sweeps back anticlockwise; `Canvas2D.arc` requires the direction argument and a paint test asserts
  the two sweeps.

- ~~**Diamond nodes dropped their accent, style colours, and icon.**~~ Fixed — the diamond display
  branch emitted only the outline + label, so colour swatches / `style`/`classDef` fills silently
  no-oped on flowchart decision diamonds and `icon "pack/name"` on a diamond rendered nothing. The
  `diamond` DrawCmd now carries `accent`/`fill`/`stroke` like `box`, and the icon renders stacked
  above the label, centred in the shape — in both backends. Unit + paint + SVG tests.

- ~~**Sequence message labels sat illegibly on dashed lines and crossed lifelines.**~~ Fixed — a
  lifted (horizontal-run) edge label is bare transparent text; when any edge line would still cross
  the lifted text box (its own line via the 11px anchor nudge, or the lifelines a message spans), the
  label now stays in-channel as `"edge-masked"` on the opaque plate that hides the lines behind it.
  Box families with a layout-provided `labelPos` keep the plateless lift.

- ~~**Dark-theme accent fills glowed.**~~ Fixed — the dark accent palette used saturated 700/900-level
  hues (bright green/purple/brick red) where the light theme uses pastels, so dark-mode cloud group
  panels were far louder than their light counterparts. Dark accents are now desaturated (~25–32% HSL
  saturation) while keeping ≥ 4.5:1 text contrast; a saturation guard joined the contrast tests.

- ~~**Edge label backgrounds read as opaque blocks.**~~ Fixed — edge label text renders at 75% alpha
  in canvas and SVG (`EDGE_LABEL_TEXT_ALPHA = 0.75`); when a masking plate is drawn it is deliberately
  opaque (it exists to hide the line behind the text). An earlier revision of this entry claimed "66%
  opacity for background and text" — no such constant exists in the code (the `0.66` in the backends
  is stickman body geometry, and `0.62` is the sketch-mode fill alpha).

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

Checked while adding semantic architecture accent fills and container accent propagation.

Checked while adding ratio-based edge-label geometry, translucent label plates, and escaped-newline
label rendering.
