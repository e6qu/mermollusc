# @m/layout — bugs

Open (cosmetic):

- **gitGraph commit labels overflow the commit dot.** The renderer centres a node's label on the node;
  a commit dot is a fixed ~26px circle, so an id/tag label wider than the dot spills over its outline
  (Mermaid draws the label beside/below the dot). The graph stays correct and legible — this is a
  styling gap, not a geometry bug. The real fix (label offset for small dots) is a renderer-level,
  family-aware change, deliberately deferred to keep the gitGraph family renderer-agnostic.

Checked while adding the gitGraph lane layout.

Checked while making the pure layouts total-by-Result (no silent positional fallbacks).

Checked while adding the optional C4 element description.

## Resolved

- ~~elkjs ships no type definitions~~ — false: `elkjs@0.11.1` ships `lib/elk-api.d.ts`
  (verified 2026-06-14). We use the bundled entry `elkjs/lib/elk.bundled.js` and still decode the
  layout result with Zod at the shell boundary before it reaches the core.

Checked while routing state diagrams through the ELK layout path.

Checked while routing composite states through flowchart subgraphs.

Checked while routing ER diagrams through the ELK path.
Checked while adding the empty-graph / self-loop layout robustness suite (no crashes found).
