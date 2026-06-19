# @m/layout — bugs

_None known._

## Resolved

- ~~**gitGraph commit labels overflow the commit dot.**~~ Fixed — a commit is now a rounded **pill
  sized to its id+tag** (not a fixed ~26px dot), so the label always sits inside, and the per-axis
  pitch is sized to fit the pills so neighbours never collide in any orientation. No renderer change
  was needed (the node-sizing moved into `layoutGitGraph`).

Checked while adding the gitGraph lane layout.

Checked while adding the timeline column layout.

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
