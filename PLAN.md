# mermollusc — project plan

A parser, graphical visualiser, and **two-way builder** for Mermaid-style diagrams, extended
to software-architecture families (flowchart/graph, sequence, C4/architecture,
block/network/cloud). Target: TypeScript + HTML Canvas, with Chrome's HTML-in-Canvas
(`drawElement`) as a feature-detected progressive enhancement — never a dependency.

See `AGENTS.md` for the operating rules. This file is the high-level map; each module owns its
own `PLAN.md`.

## Pipeline

```
text ──▶ parser ──AST──▶ layout ──SceneGraph IR──▶ renderer ──▶ canvas
                                                        ▲
                          builder (hit-test, drag, two-way sync) ┘
```

Two contracts (`AST`, `SceneGraph IR`) in `@m/contracts` are the seams. Lock them first;
everything else parallelizes against them.

## Modules & dependency DAG

```
std <- contracts <- { parser, layout, renderer, icons } <- builder <- app
```

| module | owns |
|--------|------|
| `@m/std` | branded-type kit, `Result`, `Logger` contract, geometry primitives |
| `@m/contracts` | AST + SceneGraph IR type definitions |
| `@m/parser` | text → AST, and AST → text (printer); round-trip is property-tested |
| `@m/layout` | AST → positioned SceneGraph; ELK adapter behind a typed shell facade |
| `@m/renderer` | SceneGraph → canvas; Canvas2D impl + HTML-in-Canvas enhancement |
| `@m/icons` | icon-pack registry + loaders (OSS packs bundled; cloud packs user-loaded) |
| `@m/builder` | hit-testing, selection, drag, text↔diagram two-way sync |
| `@m/app` (playground) | wires everything; hosts e2e/golden tests |

## Decisions (locked)

- **Layout engine:** ELK (`elkjs`) only — needed for nesting/ports/orthogonal routing (C4,
  block, network). No `@types/elkjs` exists (verified 2026-06-14); its surface is quarantined
  behind a `decode()` facade in `layout/src/shell`.
- **Type boundary:** two sanctioned helpers (`brand`, `decode`), shell-only. See AGENTS §3.
- **Toolchain:** pnpm workspaces + catalog, Vitest (+fast-check), tsup (lib builds), Vite (app),
  Zod (decoders), Biome (format + lint + `noExplicitAny`) + `tools/guard-types.mjs` for the
  `as`/`unknown`/wildcard bans Biome can't express.
- **Runtime / package manager: pnpm + Node, not Bun or Deno** (evaluated 2026-06-14; local:
  node 26.0.0, pnpm 11.6.0, bun 1.3.10, deno 2.7.14). The deliverable is a browser canvas
  library + builder, so the load-bearing tools are Vite (browser bundling) and Vitest (DOM/canvas
  test environments) — both Node-ecosystem-first. Bun's catalog + isolated installs still had
  documented monorepo dedup bugs in 1.3.x; Deno's strengths (permissions sandbox, web APIs, jsr)
  don't help a client-side tool and adopting it would force replacing Biome + Vitest. pnpm's
  workspace/catalog story is mature and zero-migration. Future lever, not now: Bun purely as
  installer/script-runner ("Bun install + Vite") if install/CI speed ever hurts.
- **Parser:** Chevrotain, one grammar per family, producing a CST with source spans.
- **Mermaid fidelity:** a pragmatic subset, grown against pinned Mermaid fixtures — not
  bug-for-bug compatibility up front.
- **Layout execution:** elkjs runs in a Web Worker; the pipeline from layout onward is async.
- **Sync source of truth:** text/CST is authoritative for structure; structural canvas edits patch
  text ranges so formatting/comments survive. Manual geometry lives in a **sidecar overrides layer**
  (`nodeId → position/size/pinned`), never in the Mermaid text. *Regenerate* re-runs ELK on unpinned
  nodes only; *relax* feeds manual positions to ELK as soft seeds; a structural edit keeps overrides
  and auto-places only new nodes. (See `modules/builder/PLAN.md`.)
- **Supply chain:** pin only stable releases ≥24h old; `make deps-check` audits the catalog.

## Pinned versions — provenance

Verified 2026-06-14 via `npm view <pkg> version`; pinned in `pnpm-workspace.yaml` catalog:
typescript 6.0.3 · @biomejs/biome 2.5.0 · vitest 4.1.8 · tsup 8.5.1 · vite 8.0.16 ·
zod 4.4.3 · elkjs 0.11.1 · fast-check 4.8.0 · @types/node 25.9.3 · pnpm 11.6.0.

## License

**AGPL-3.0-or-later** (SPDX). `LICENSE` is the verbatim FSF text, downloaded 2026-06-14 from
`https://www.gnu.org/licenses/agpl-3.0.txt` (sha256 `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`).
Every `package.json` carries the SPDX field. Bundled icon packs must be license-compatible with
AGPL and properly attributed (Apache-2.0 / CC-BY OSS packs are fine; vendor cloud packs stay
user-loaded, never redistributed — see `modules/icons`).

## Milestones

1. **Scaffold** (this phase): repo skeleton, contracts seams, green `make check` on empty tree.
2. **Vertical slice — flowchart**: parser→layout→renderer→builder end-to-end on flowchart only,
   including two-way sync, to prove the contracts and the sync machinery before fanning out.
3. **Fan-out families**: sequence, C4, block/network across parser + layout.
4. **Icons**: OSS packs (Kubernetes/CNCF/simple-icons/devicon) + cloud-pack loaders.
5. **HTML-in-Canvas** enhancement path for rich nodes, behind feature detection.

## Family scope (v1)

Flowchart/graph · Sequence · C4/architecture · Block/network/cloud. Full two-way builder.
