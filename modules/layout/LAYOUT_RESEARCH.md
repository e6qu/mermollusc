# Research spike — node-placement & edge-routing algorithms

A spike (no engine built yet) into "spring/heat/selectable algorithms for arranging nodes and edges,"
asked for during the timeline/select/palette work. Conclusion first, evidence after.

## TL;DR recommendation

1. **Do not build a bespoke force/annealing engine.** It fights two principles this editor depends on:
   determinism (same text → same picture, byte-for-byte goldens) and *stability under edits* (typing one
   line must not reshuffle the whole diagram). Spring/simulated-annealing layouts are seed-sensitive and
   re-converge to different minima after small changes — the opposite of what a bidirectional text↔canvas
   editor wants.
2. **We already ship the alternatives.** `elkjs@0.11.1` (`modules/layout/src/shell/elk.ts:36`) bundles
   `layered`, `stress`, `force`, `mrtree`, `radial`, `rectpacking`, `sporeOverlap`, `disco`, `box`,
   `fixed`. "Selectable algorithm" for the ELK families (flowchart/state/er/class/requirement) is mostly
   wiring the `elk.algorithm` option we already set to a constant (`"layered"`, elk.ts:124) — not new math.
   `stress` is ELK's deterministic force-like algorithm; it's the right "spring without the chaos."
3. **The reported pain (overlapping edges at flowchart choices) is an edge-routing/port problem, not a
   node-placement one.** The deterministic fix is port assignment + ELK's edge-routing option, below.

## Current state (verified)

- ELK families (flowchart, state, er, class, requirement) → `elk.algorithm=layered` with
  `crossingMinimization.semiInteractive`, `cycleBreaking=INTERACTIVE`, `layering=INTERACTIVE`
  (elk.ts:124–134). The INTERACTIVE strategies already bias ELK toward *preserving* the prior arrangement
  across edits — i.e. stability is an explicit existing goal.
- Hand-rolled absolute layouts (c4, cloud, network, block, sequence, pie, gantt, gitgraph, timeline,
  mindmap) compute positions directly; edges route through `route.ts` (`orthogonalRoute` etc.).
- Edges attach at node *centres* and are clipped to the border; there is no per-edge *port* (side/offset)
  assignment, so two edges leaving the same node side overlap.

## Options considered

### Node placement
| Algorithm | Deterministic | Stable under edits | Quality (graphs) | Notes |
|---|---|---|---|---|
| Layered / Sugiyama (current) | yes | yes (interactive) | high for DAGs | what we use; best for flows |
| ELK `stress` (majorization) | yes (fixed seed) | medium | high for general graphs | built into elkjs; "spring, tamed" |
| ELK `force` (Eades/Fruchterman) | seed-dependent | low | medium | built in, but jittery across edits |
| ELK `mrtree` / `radial` | yes | yes | high for trees | mindmap-like families |
| Bespoke simulated annealing ("heat") | no | no | can be high | rejected: non-determinism breaks goldens + two-way editing |

**Lesson:** the literature's "force-directed is prettier" assumes a *static* one-shot render. For an
editor with goldens and live text sync, *deterministic + incremental* (layered/stress with interactive
seeding) wins. If we want a "spring" feel, expose ELK `stress`/`mrtree` per-family rather than rolling our
own.

### Edge routing / overlap
- **Port assignment (highest value, deterministic):** choose which node *side/point* each edge attaches to
  by the neighbour's relative direction (a down-right neighbour → exit the bottom or right, offset by index
  so siblings don't stack). Pure geometry over the existing scene; no engine. Directly addresses the
  flowchart-choice overlap.
- **ELK edge routing:** `elk.layered.edgeRouting = ORTHOGONAL | SPLINES | POLYLINE` plus
  `spacing.edgeEdgeBetweenLayers` — a one-option deterministic improvement for the ELK families.
- **Junction handling:** when edges genuinely merge, a junction dot (already scoped in app DO_NEXT) reads
  better than crossing lines.

## Proposed sequencing (when we pick this up)

1. **Port assignment in `route.ts`** — deterministic, fixes the reported overlap, no new deps. *(small)*
2. **Expose `elk.layered.edgeRouting` + edge spacing** as layout config. *(small)*
3. **Per-family `elk.algorithm` selector** (layered / stress / mrtree / radial) surfaced as a UI choice —
   leans entirely on elkjs, stays deterministic. *(medium)*
4. Only if a free-form family demands it: evaluate ELK `stress` as the default there. No bespoke
   force/annealing engine unless a concrete family can't be served by the above. *(defer)*

The win is that steps 1–3 are bounded and deterministic and reuse a dependency we already pay 1.5 MB for —
versus a multi-week bespoke physics engine that would undermine determinism and the two-way-edit contract.
