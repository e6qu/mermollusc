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
- *(done)* All five pure layouts (`sequence`/`c4`/`cloud`/`block`/`network`) now return
  `Result<Scene, LayoutError>` and fail loudly on an internally-inconsistent AST: an edge/relation/
  message/link whose endpoint isn't a known node, or (c4/cloud) an element whose `parent` is dangling
  or cyclic so it was never placed. The silent `?? 0` / `?? {default box}` / dropped-edge `continue`
  fallbacks are gone. The idiomatic `?? []` multimap builds stay — an empty child list is a valid
  state, not a masked error.
- *(done)* The ER/class/requirement compartment layouts share one `layoutCompartments` engine
  (`CompartmentBox`/`CompartmentEdge` specs + per-family metrics) instead of three copies of the ELK
  boilerplate. A future compartment family is now a small AST→spec mapper.
- gitGraph: *(done — deterministic lane layout, LR/TB/BT)*. Follow-up: offset commit labels beside the
  dot (a renderer-level change) so they don't overflow the small circle; orthogonal/curved branch+merge
  connectors instead of straight diagonals.
- timeline: *(done — column layout with a period spine, stacked events, section bands)*. Follow-up:
  alternate event cards above/below the spine (Mermaid-style) once a family-aware renderer pass exists.
- mindmap: *(done — layered LR tree via the flowchart ELK path)*. Follow-up: a radial/balanced layout
  (Mermaid-style) once a dedicated mindmap engine is worth it.
- pie: *(done — radial wedge layout, slices clockwise from 12 o'clock)*. Follow-up: a side legend for
  many-slice charts; honour `showData` (value alongside the percentage).
