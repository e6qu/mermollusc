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

std <- contracts <- { parser, layout, renderer, icons } <- builder <- collab <- app
```

`@m/contracts` holds the two seams (AST, SceneGraph IR) plus `LayoutOverrides`, `SourceMap`, and the
`OverlayDoc` port. `@m/collab` is the Yjs-backed `OverlayDoc` implementation (collaborative editing).

| module | owns |
|--------|------|
| `@m/std` | branded-type kit, `Result`, generic `Logger` contract, `Coordinate`/`Length` geometry, `brand()`/`decode()` |
| `@m/contracts` | AST (flowchart, sequence, C4, block, network) + SceneGraph IR + overrides + sidecar groups + source-map types |
| `@m/parser` | text → AST (+ source spans), AST → text (printer) |
| `@m/layout` | AST → positioned Scene (ELK), relax via semi-interactive seeds |
| `@m/renderer` | Scene → canvas (Canvas2D display list + painter) |
| `@m/icons` | icon-pack registry + loaders (OSS bundled; cloud packs user-loaded) |
| `@m/builder` | hit-testing, selection, sidecar overrides, two-way text patching |
| `@m/collab` | Yjs `OverlayDoc` + `Y.Text` source binding + presence + WebSocket transport + optional durable relay (`server/`) — CRDT collaboration |
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

**Fourteen families render in the browser — flowchart, sequence, C4, block, network, cloud, state, ER,
class (UML), requirement (SysML), gitGraph, timeline, mindmap, and pie — and the first ten are fully
two-way** (double-click → patch the source text); gitGraph/timeline/mindmap are render + inline relabel
of their node/period/event labels; pie is render-only (a chart, not an editable node/edge diagram).
Every node/edge family has drag/resize/align, connect, and delete; flowchart also has relax/regenerate
and add. Network nodes show built-in glyphs; cloud nodes show **vendored simple-icons brand marks**
(CC0, pinned). Icons-in-nodes is wired end-to-end.

| module | state | tests |
|--------|-------|-------|
| `@m/std` | ✅ Result + monad combinators (map/flatMap/mapErr/match/all/tap), Brand, `Coordinate`/`Length` geometry (validated), Logger + `stamp()`, `brand()`/`decode()` (+ property laws, shell tests; 100% cov) | 26 |
| `@m/contracts` | ✅ flowchart/sequence/C4/block/network/cloud/state/ER AST, Scene IR (+shape, edge stroke/arrow, icon ref, flowchart subgraphs), overrides, source-maps (incl. flowchart edge spans) | (types) |
| `@m/parser` | ✅ flowchart (node+edge spans) · sequence · C4 · block · network · cloud · state (`stateDiagram-v2`, composites) · ER (`erDiagram`) — +spans; icon override on network/cloud/block · stadium/circle shapes · subgraph grouping · ✅ routing · property round-trip · `ParseError.positions` (offset/length) | 54 |
| `@m/layout` | ✅ flowchart + state + ER (ELK) + relax · sequence · C4/cloud nested-box · block/network grid · injectable text measurer + square circle nodes + subgraph ELK hierarchy · ✅ routing · property tests | 36 |
| `@m/renderer` | ✅ Scene → canvas (shapes, labels, dashed/arrow polylines, icon glyphs, light/dark + sketch themes) + `toSvg` vector backend; html-in-canvas detect | 13 |
| `@m/builder` | ✅ hit-test, selection, overrides (move + connector re-anchor + extent growth), two-way relabel/add · connect (all families) + delete (flowchart/block/network/cloud) · sidecar group model (nestable, move-only lock) · overlay codec (persist) (+ property-based) | 41 |
| `@m/icons` | ✅ registry/resolver · per-icon categories (incl. `brands`) · built-in arch+BPMN+sketch · in-node rendering · user-loaded packs · vendored simple-icons/devicon(61)/gilbarbara/k8s · CNCF (LFS) | 15 |
| `@m/app` | ✅ renders + two-way edits all eight families (incl. flowchart edge labels) via an inline editor overlay; in-node icons (+override) + load-pack + icon-picker drawer; HiDPI; persisted dark/light + sketch; flowchart drag/relax/regen/add/connect/delete-node+edge. **Designed shell** (drafting-table chrome, inline error/status surface incl. parse line:col + click-to-locate, examples menu, family-aware controls) + persisted source + `make shots` UI harness + per-family pipeline goldens + PNG/PDF/SVG export + shareable links + canvas zoom/fit/pan + overview minimap + multi-node drag (move-together, connectors re-anchor) + element grouping (group/ungroup/lock, move-whole-group, outlines) + persisted overlay (positions + groups) + connect across all families | 7 vitest + 81 Playwright |

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
   official cloud-provider architecture sets + AliCloud are user-loaded — not redistributable:
   `tools/pack-dir.mjs` converts a downloaded SVG folder → loadable pack JSON for the "Load icons"
   button. Full CNCF landscape (2423 logos) archived via git-LFS at `vendor/cncf.json`, not bundled.)*
2. **Renderer polish**: build the HTML-in-Canvas rich-label backend once the API ships in stable
   Chromium (detection — `htmlInCanvasSupported()` — is wired; the API is flag-only today, so a
   backend can't be verified here). *(Light/dark + sketch themes + device-pixel-ratio + real text
   measurement done.)*
3. **App polish**: CodeMirror editor (span-aware edits, inline parse errors), pixel/golden tests.
   *(Theme persistence done.)*
4. **Cross-cutting**: regenerate unpinned-only; raise coverage ratchets as coverage climbs.
   *(Property-based tests — Result laws, builder patches, block/network/ELK layout invariants, and
   the parser print→parse round-trip — plus `make cov` per-module coverage thresholds are wired.)*

### External review backlog (codex `gpt-5.5`, 2026-06-19) — ✅ all resolved (PR #59)

A read-only senior review (sources: Mermaid 11.15.0, PlantUML, D2, Graphviz). All eight findings
(five P1, three P2) are fixed; per-fix detail is in the owning module's `BUGS.md` / `WHAT_WE_DID.md`.

P1 (defects — verified against source):
1. ✅ **Delete corrupts brace-bodied entities** — family entity-delete (`deleteErEntity` /
   `deleteClassEntity` / `deleteRequirementEntity`) removes the whole `{ … }` block + incident rels.
2. ✅ **Drag/resize extent only grew right/down** — `applyOverrides` emits the true (negative-origin)
   extent; paint, pointer→scene, minimap, and SVG export offset by it.
3. ✅ **Unhandled icon-decode rejection** — `ensureIcons` catches per-icon, logs, still paints,
   surfaces failures.
4. ✅ **Cloud group id collision** — synthetic group ids are now `group:N` (`:` is outside the id space).
5. ✅ **Malformed `icon "…"` silently nulled** — shared `iconRefOf` → `Result`; parse fails loudly.

P2:
6. ✅ **Requirement verb labels editable** — verb spans captured in `ReqSource.relationships`.
7. ✅ **Inline editor honours `viewScale`** — overlay maps scene→screen like the painter.
8. ✅ **Goldens cover the state family** — flat + composite state samples added.

### Capability parity (Mermaid families) — ✅ done

Added the Mermaid families we lacked, one PR at a time. Each is a full vertical slice (contracts AST
+ source spans → parser trio → layout engine → app wiring + example → parser/layout/e2e/golden tests).

- ✅ **gitGraph** — `commit`/`branch`/`checkout`/`switch`/`merge` with `id:`/`tag:`/`type:` and the
  `LR`/`TB`/`BT` header directions. A deterministic lane layout (no ELK): commits march along the main
  axis in creation order, each branch owns a cross-axis lane, parent edges fan out at branches and back
  in at merges. Fits the node/edge SceneGraph with **zero renderer changes** (commits are circle nodes,
  `HIGHLIGHT` a rect; branch names are round head nodes). Inline relabel of explicit commit ids.
- ✅ **timeline** — `title`, `section` groupings, and `period : event : event` lines (events also via
  `:`-continuation lines). A two-mode lexer keeps `title`/`section` special only at the line head while
  period/event text holds spaces. Deterministic column layout (no ELK): periods in a spine-joined row,
  events stacked per column, section bands above their runs — **zero renderer changes**. Inline relabel
  of period + event text.
- ✅ **mindmap** — indentation-defined hierarchy, the shapes (`[square]`/`(rounded)`/`((circle))`/
  `{{hexagon}}`/plain), and `::icon()`/`:::class` decorations (parsed + stripped — no icon pack). A
  single-mode lexer skips leading whitespace so each line's `startColumn` *is* its indentation; the
  CST→AST step rebuilds the tree from those columns. Lays out with a dedicated **radial** engine
  (`layoutMindmap`): root at the centre, subtrees fanning into leaf-weighted angular sectors, depth →
  radius — **zero renderer changes** (arrowless spokes). Inline node relabel.
- ✅ **pie** — `pie [showData]`, optional `title`, and `"label" : value` rows (a two-mode lexer reads
  the unquoted title; non-positive values fail loudly). The **one family that needed a new SceneGraph
  primitive**: `Scene` gained a `wedges` array and the renderer a `wedge` `DrawCmd` (canvas arc + SVG
  `<path>` sector, a shared categorical palette). `layoutPie` sizes slices by share and lays them
  clockwise from 12 o'clock; slice labels show name + percentage. Render-only (a chart, not an editable
  node/edge diagram), so no drag/relabel.

### Interoperability — DOT (Graphviz) — ✅ round-trip

- ✅ **DOT import** — `parseDot` imports a Graphviz `[strict] (graph|digraph) { … }` (node/edge
  statements, `a -> b -> c` chains, `node`/`graph` default-attr statements, `rankdir`, `label`/`shape`/
  `style` attrs) as a **`FlowchartAst`**, so it renders + lays out through the existing flowchart ELK
  pipeline with no contracts/layout/renderer changes. `parseDiagram` routes `digraph`/`strict`, and
  `graph` only when its header line carries `{` (so Mermaid's `graph TD` — whose `{` is a decision-node
  label — isn't stolen). Nested `subgraph` blocks import too: `cluster*` ones become `FlowSubgraph`
  boxes (label + nesting), others are transparent. Ports and HTML labels are out of scope.
- ✅ **DOT export** — `toDot(scene)` (renderer core) serialises the **Scene** — the universal graph IR
  — so *any* node/edge family exports to DOT (a pie, having no nodes, exports as an empty graph). Maps
  `NodeShape`→DOT shape and each `EdgeEnd`→a Graphviz arrowtype; the app's **DOT** export button
  downloads `mermollusc.dot`. An export↔import round-trip test (app) pins consistency.

### Future bets (not yet scoped)

- **More software-architecture families:** component / deployment / use-case / activity (PlantUML
  parity), Gantt (planning).

- **Real-time collaborative editor (CRDT).** Multi-user live editing — fully scoped in
  [`docs/collab-editor-plan.md`](docs/collab-editor-plan.md): a Yjs-based shared **source text +
  overlay** (the diagram stays *derived locally*, so the pure core is reused and CRDT payloads stay
  tiny), presence/awareness, local-first low latency, and a server-authoritative sync service. This
  **subsumes the audit-trail and multi-tenancy bets below** (the Yjs update log is the audit trail;
  rooms + server-side RBAC give tenant isolation). Enterprise-ready, but a large infra commitment and a
  deliberate departure from the current client-only design.

  **Decisions signed off (2026-06-20, doc §10):** Yjs · server-authoritative WebSocket · self-hosted
  Postgres + S3 + Redis · OIDC via the existing IdP (specific provider TBD) · extend a Node Yjs server
  (Hocuspocus). **Phased roadmap** (doc §9):
  - **Phase 0 — the seam (no infra). ✅ DONE.** Overlay state (overrides + groups + history)
    extracted behind the `OverlayDoc` document-model interface in the app
    (`app/playground/src/document-model.ts`), with `createLocalDocument` as the single-user
    implementation; the source text has the symmetric seam in `Editor` (`editor.ts`). Pure refactor,
    zero backend — collab now plugs in as a second `OverlayDoc` implementation without touching call
    sites.
  - **Phase 1 — proof of merge (feature-complete).** `@m/collab` Yjs document (overlay + source) + a dev
    WebSocket transport/relay + the live `Y.Text`↔CodeMirror source binding + presence; two `?collab`
    tabs share overlay **and** text live and see each other's cursors. (Open before Phase 2: confirm the
    specific OIDC IdP.)
  - **Phase 2 — durable + secured (in progress).** Landed: a pluggable `RoomStore` (memory + file
    snapshots; rooms survive restart), **Auth0 OIDC verification** at the relay handshake (JWKS via
    `jose`, env-gated), and **rooms + RBAC** (server-enforced per-document roles + tenant isolation;
    viewers read-only) — with the **client reflecting the role** (a viewer's editor + canvas are
    read-only). Decided to extend our own relay (not Hocuspocus, §10.5). Next: the browser Auth0 login,
    then the production store (Postgres + S3). The app always runs single-user with zero infra — collab
    is an optional mechanism, never a fork.
  - **Phase 3 — scale + enterprise hardening.** Pub/sub fan-out, per-tenant isolation, audit export,
    observability/SLOs, offline buffer, compaction, compliance hooks.
- **Comprehensive, searchable audit trail.** (Folded into the collaborative-editor plan — the CRDT
  update log is a who/changed-what/when record.) Could still ship standalone, client-side, sooner.
- **Multi-tenancy.** (Folded into the collaborative-editor plan — rooms + server-side RBAC + per-tenant
  storage.) A deliberate expansion away from the purely-client architecture.

## How to resume (fresh session / after compaction)

1. Read `AGENTS.md` (hard rules + structure) then this file (architecture, decisions, status, roadmap).
2. For any module: its `STATUS.md` is the one-glance current state, `DO_NEXT.md` the next concrete
   actions, `BUGS.md` known issues, `WHAT_WE_DID.md` the work log.
   **Current focus:** capability parity (Mermaid families) is **done** (gitGraph, timeline, mindmap,
   pie), and DOT **round-trip** interop (import + export) too. The **collaborative-editor Phase 0 seam**
   is **done** (the `OverlayDoc` document model in the app — see Future bets). Next candidates: the
   collab decision points + Phase 1 (needs sign-off), more software-architecture families, or Gantt.
   The *External review backlog* is resolved.
3. `make check` is the gate (typecheck + lint + guard + fmt + tests). `make hooks` installs the
   pre-commit pipeline; `make deps-check` audits version pins. Commit per task; the repo lives at
   `e6qu/mermollusc` (push via the `github.com-e6qu` SSH alias).
4. Vendored icons split by license: `modules/icons/vendor/open/` (bundleable CC0/MIT/Apache, committed;
   `cncf.json` is ~64 MB via **git-LFS** — `git lfs install` to materialise, nothing references it so a
   non-LFS checkout still builds) and `vendor/restricted/` (non-redistributable sets — **git-ignored**,
   populated locally via `tools/pack-dir.mjs`; see `vendor/restricted/README.md`).
