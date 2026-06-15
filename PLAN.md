# mermollusc — project plan

A parser, visualiser, and **two-way builder** for Mermaid-style diagrams, extended to
software-architecture families (flowchart/graph, sequence, C4/architecture, block/network/cloud).
TypeScript + HTML Canvas; HTML-in-Canvas (`drawElement`) is a future progressive enhancement,
never a dependency.

Operating rules live in `AGENTS.md`. This file is the high-level map + status + roadmap. Each
module owns its own `PLAN.md` / `STATUS.md` / `WHAT_WE_DID.md` / `DO_NEXT.md` / `BUGS.md` — read
those for detail. **To resume work, see "How to resume" at the bottom.**

## Pipeline & dependency DAG

```
text ──▶ parser ──AST──▶ layout ──SceneGraph IR──▶ renderer ──▶ canvas
                                                       ▲
                         builder (hit-test, drag, two-way sync) ┘

std <- contracts <- { parser, layout, renderer, icons } <- builder <- app
```

`@m/contracts` holds the two seams (AST, SceneGraph IR) plus `LayoutOverrides` and `SourceMap`.

| module | owns |
|--------|------|
| `@m/std` | branded-type kit, `Result`, generic `Logger` contract, geometry primitives, `brand()`/`decode()` |
| `@m/contracts` | AST (flowchart, sequence) + SceneGraph IR + overrides + source-map types |
| `@m/parser` | text → AST (+ source spans), AST → text (printer) |
| `@m/layout` | AST → positioned Scene (ELK), relax via semi-interactive seeds |
| `@m/renderer` | Scene → canvas (Canvas2D display list + painter) |
| `@m/icons` | icon-pack registry + loaders (OSS bundled; cloud packs user-loaded) |
| `@m/builder` | hit-testing, selection, sidecar overrides, two-way text patching |
| `@m/app` (playground) | wires everything; hosts node e2e + Playwright flows |

## Decisions (locked)

- **Layout engine:** ELK (`elkjs`) only — needed for nesting/ports/orthogonal routing. It ships
  its own TS types (`lib/elk-api.d.ts`); we use the bundled node-safe entry `elkjs/lib/elk.bundled.js`
  and still decode its result with Zod at the shell boundary.
- **Layout execution:** runs inline (node + browser) with an async API; the app may inject a Web
  Worker (`workerFactory`) later to offload.
- **Type boundary:** two sanctioned helpers (`brand`, `decode`), shell-only (AGENTS §3).
- **Toolchain:** pnpm workspaces + catalog · Vitest (+fast-check) · tsup · Vite · Zod · Biome +
  `tools/guard-types.mjs` (bans, in core, `as`/`unknown`/`undefined`/optional/`Record<string>`;
  bans wildcards + suppressions across src). **Runtime: pnpm + Node, not Bun/Deno.**
- **Parser:** Chevrotain, one lexer+grammar per family, producing a CST; spans captured for sync.
- **Mermaid fidelity:** a pragmatic subset, grown against fixtures — not bug-for-bug up front.
- **Sync model:** text/CST is authoritative for structure; structural canvas edits patch text
  ranges (formatting/comments survive). Manual geometry lives in a **sidecar overrides layer**
  (`nodeId → position/size/pinned`), never in the text. *Relax* = re-run ELK semi-interactive
  seeded by current positions; *Regenerate* = clean re-layout (drops overrides). Refining
  regenerate to unpinned-only is future (ELK can't cleanly fix a subset).
- **Supply chain:** pin only stable releases ≥24h old; `make deps-check` audits the catalog.
- **License:** AGPL-3.0-or-later (verbatim FSF `LICENSE`); every `package.json` carries the SPDX
  field. Bundled icon packs must be AGPL-compatible + attributed; vendor cloud packs stay
  user-loaded, never redistributed.

Pinned versions (verified 2026-06-14, in `pnpm-workspace.yaml` catalog / `.pre-commit-config.yaml`):
typescript 6.0.3 · biome 2.5.0 · vitest 4.1.8 · tsup 8.5.1 · vite 8.0.16 · zod 4.4.3 ·
elkjs 0.11.1 · fast-check 4.8.0 · @types/node 25.9.3 · pnpm 11.6.0 · chevrotain 12.0.0 ·
@playwright/test 1.60.0 · pre-commit-hooks v6.0.0 · gitleaks v8.30.1 · semgrep 1.166.0.

## Status — what's built

Flowchart is a **complete two-way builder, live in the browser**. Sequence family is underway.

| module | state | tests |
|--------|-------|-------|
| `@m/std` | ✅ Result, Brand, geometry, generic Logger, `brand()`/`decode()` | 5 |
| `@m/contracts` | ✅ flowchart + sequence AST, Scene IR (+shape), overrides, source-map | (types) |
| `@m/parser` | ✅ flowchart (parse/parseWithSource/print + spans) · ✅ sequence (parseSequence) | 9 |
| `@m/layout` | ✅ flowchart → Scene (ELK) + relax seeds · ⬜ sequence layout | 5 |
| `@m/renderer` | ✅ Scene → canvas (box/diamond/labels/polylines) · ⬜ dashed/arrowheads | 4 |
| `@m/builder` | ✅ hit-test, selection, overrides, two-way relabel · ⬜ add/connect/delete | 15 |
| `@m/icons` | ⬜ not started | — |
| `@m/app` | ✅ interactive flowchart editor (edit/select/drag/relabel/relax/regenerate) | 1 node + 5 Playwright |

CI: pre-commit pipeline installed (`make hooks`) — pre-commit (gitleaks, fmt, lint, typecheck,
tests) and pre-push (semgrep SAST, Playwright, API placeholder), all green.

## Roadmap — the plan ahead

1. **Finish the sequence family** (in flight): pure lane layout (actors row, lifelines, stacked
   messages) → Scene — decide lifeline representation (SceneEdge vs minimal Scene extension);
   renderer dashed lines + arrowheads per `MessageKind`; app routing via a header-sniffing
   `parseDiagram` (`flowchart`/`graph` vs `sequenceDiagram`) → `DiagramAst`.
2. **Sequence two-way**: source spans for sequence → relabel/edit parity with flowchart.
3. **More flowchart two-way patches**: add node, connect (insert edge), delete node/edge.
4. **Next families**: C4/architecture (nested containers → ELK hierarchy + Scene `parent`),
   then block/network/cloud.
5. **Icons** (`@m/icons`): bundle OSS packs (Kubernetes Apache-2.0, CNCF, simple-icons CC0,
   devicon MIT) with per-pack provenance; loaders for user-supplied vendor cloud packs.
6. **Renderer polish**: arrowheads, edge labels, theme + device-pixel-ratio, HTML-in-Canvas
   backend behind feature detection.
7. **App polish**: CodeMirror editor (span-aware edits, inline parse errors), pixel/golden tests.
8. **Cross-cutting**: per-layer coverage thresholds; property-based tests (parser round-trip,
   layout invariants); refine regenerate to unpinned-only.

## How to resume (fresh session / after compaction)

1. Read `AGENTS.md` (hard rules + structure) then this file (architecture, decisions, status, roadmap).
2. For any module: its `STATUS.md` is the one-glance current state, `DO_NEXT.md` the next concrete
   actions, `BUGS.md` known issues, `WHAT_WE_DID.md` the work log.
3. `make check` is the gate (typecheck + lint + guard + fmt + tests). `make hooks` installs the
   pre-commit pipeline; `make deps-check` audits version pins. Commit per task; the repo lives at
   `e6qu/mermollusc` (push via the `github.com-e6qu` SSH alias).
