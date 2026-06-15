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
| `@m/contracts` | AST (flowchart, sequence, C4, block, network) + SceneGraph IR + overrides + source-map types |
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

**Six families render in the browser — flowchart, sequence, C4, block, network, cloud — and all six
are two-way** (double-click → patch the source text). Flowchart also has drag, relax/regenerate,
add, connect, and delete. Network nodes show built-in glyphs; cloud nodes show **vendored
simple-icons brand marks** (CC0, pinned). Icons-in-nodes is wired end-to-end.

| module | state | tests |
|--------|-------|-------|
| `@m/std` | ✅ Result, Brand, geometry, generic Logger, `brand()`/`decode()` (+ property-based laws, shell tests; 100% cov) | 21 |
| `@m/contracts` | ✅ flowchart/sequence/C4/block/network/cloud AST, Scene IR (+shape, edge stroke/arrow, icon ref), overrides, source-maps | (types) |
| `@m/parser` | ✅ flowchart · sequence · C4 · block · network · cloud — all +spans; icon override on network/cloud/block · ✅ routing · property round-trip | 37 |
| `@m/layout` | ✅ flowchart (ELK) + relax · sequence · C4/cloud nested-box (cloud→simple-icons) · block/network grid · ✅ routing · property tests | 23 |
| `@m/renderer` | ✅ Scene → canvas (shapes, labels, dashed/arrow polylines, in-node icon glyphs, light/dark + sketch themes) | 8 |
| `@m/builder` | ✅ hit-test, selection, overrides, two-way relabel/add/connect/delete (+ property-based) | 25 |
| `@m/icons` | ✅ registry/resolver · built-in arch + BPMN packs · in-node rendering · user-loaded packs · vendored simple-icons/devicon/gilbarbara/k8s · CNCF archived (LFS) | 12 |
| `@m/app` | ✅ renders + two-way edits all six families; in-node icons (+ override) + load-pack; HiDPI; persisted dark/light + sketch themes; flowchart drag/relax/regen/add/connect/delete | 1 node + 27 Playwright |

CI: pre-commit pipeline installed (`make hooks`) — pre-commit (gitleaks, fmt, lint, typecheck,
tests) and pre-push (semgrep SAST, Playwright, API placeholder), all green. `make cov` enforces
per-module coverage thresholds (ratchets in each module's `vitest.config.ts`).

## Roadmap — the plan ahead

1. **Icons**: per-node `icon "<pack>/<name>"` override is on network + cloud + block. (Flowchart/C4
   deferred — their chain / paren-arg grammars make a node-level icon slot awkward and low-value.)
   Optional authored `sketch` glyph pack for hand-drawn mode. *(hand-drawn Sketch mode shipped;
   original AGPL BPMN pack authored; simple-icons (CC0, 36) + devicon (MIT,
   AWS/Azure/GCP/Oracle marks) + gilbarbara (CC0, AWS services) + Kubernetes-community (Apache-2.0,
   resource shapes) bundled with pinned provenance; CNCF landscape archived via git-LFS;
   official cloud-provider architecture sets + AliCloud are user-loaded — not redistributable. Full
   CNCF landscape (2423 logos) archived via git-LFS at `vendor/cncf.json`, not bundled.)*
2. **Renderer polish**: HTML-in-Canvas backend behind feature detection; real text measurement →
   node sizes. *(Themeable palette (light/dark + hand-drawn sketch mode) + device-pixel-ratio done.)*
3. **App polish**: CodeMirror editor (span-aware edits, inline parse errors), pixel/golden tests.
   *(Theme persistence done.)*
4. **Cross-cutting**: regenerate unpinned-only; raise coverage ratchets as coverage climbs.
   *(Property-based tests — Result laws, builder patches, block/network/ELK layout invariants, and
   the parser print→parse round-trip — plus `make cov` per-module coverage thresholds are wired.)*

## How to resume (fresh session / after compaction)

1. Read `AGENTS.md` (hard rules + structure) then this file (architecture, decisions, status, roadmap).
2. For any module: its `STATUS.md` is the one-glance current state, `DO_NEXT.md` the next concrete
   actions, `BUGS.md` known issues, `WHAT_WE_DID.md` the work log.
3. `make check` is the gate (typecheck + lint + guard + fmt + tests). `make hooks` installs the
   pre-commit pipeline; `make deps-check` audits version pins. Commit per task; the repo lives at
   `e6qu/mermollusc` (push via the `github.com-e6qu` SSH alias).
4. The repo uses **git-LFS** for one archival asset (`modules/icons/vendor/cncf.json`, ~64 MB).
   `git lfs install` to materialise it on clone; nothing in the build references it, so a non-LFS
   checkout (pointer file) still builds and tests green.
