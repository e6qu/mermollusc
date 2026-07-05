# AGENTS.md — mermollusc operating manual

This file is the contract for working in this repo. `CLAUDE.md` is a symlink to it.
Read it before touching any module. These rules **override** convenience.

---

## 0. Hard rules (non-negotiable)

1. **No fallbacks. Fail loudly.** No empty catches, no "log and continue", no silent
   defaults, no swallowed errors. In the functional core, errors are `Result` values and
   are returned, not hidden. At the shell boundary they are logged loudly and surfaced.
   (Retries/backoff for genuine network flakiness are not fallbacks — they are allowed.)
2. **Don't guess. Don't assume.** Every claim must trace to a verifiable source: actual
   source code, an official spec, official docs, or something confirmed with a command.
   No memory-based assertions. If you can't verify it, say so.
3. **Pin dependencies from reality, with a supply-chain quarantine.** Never write a version
   from memory. Pin the latest *stable* release that is **at least 24h old** — never one younger
   than a day, since a fresh release may be a hijack. Choose it with `tools/pick-version.mjs <pkg>`
   and audit the catalog with `make deps-check`. Pins live in the `catalog:` of `pnpm-workspace.yaml`.
4. **Strong types only.** No `any` anywhere. In `src/core`: no `unknown`, no `as` (except the two
   sanctioned helpers, §3), no authored `undefined` or optional `?:` (use `null`, required fields,
   or default params), no `Record<string|number,…>` or index-signature dicts (use closed-union
   keys or typed fields). No type/lint suppressions (`@ts-ignore`, `@ts-expect-error`,
   `@ts-nocheck`, `biome-ignore`) anywhere. Branded types over primitives; closed unions over
   strings. Smart constructors validate.
5. **Provenance.** Any bundled asset (e.g. icon packs) carries source URL, license, and a
   pinned commit. No unsourced assets.
6. **Docs move with code.** Update this module's `PLAN.md`, `STATUS.md`, `WHAT_WE_DID.md`,
   `DO_NEXT.md`, `BUGS.md` in the *same* change that touches its code — never as a follow-up.
7. **No phase numbers or BUGS IDs in source or comments.** They rot. The "why" goes in the
   commit message, not the code.
8. **No wildcard or inline imports.** No `import * as` and no `export *`. Every symbol that
   crosses a module boundary is named explicitly (`export { a, b } from`, `export type { … }`).
   Barrels are allowed only as explicit named re-export lists. **No inline `import("…")` type
   expressions, and imports live only at the top of the file — no mid-file imports, not even to
   break a circular dependency (rearrange the files instead).** Enforced by `tools/guard-types.mjs`
   across `src`. Keeps the public surface, tree-shaking, and the dependency graph legible.
9. **No noise comments.** No separator/banner comments and no comments that restate the code
   or these rules. Keep only comments that explain something the code cannot: a boundary, an
   invariant, a non-obvious "why". Never cite rule/section numbers in code — they rot.
10. **Graph-wide scope by default.** When asked to change rendering, interaction, layout,
    examples, or demo behavior, apply the fix to every applicable graph family and to the demo
    website. Push back only when that is impossible; in that case, ask for direction and halt
    instead of shipping a narrow partial fix.
11. **EXACTLY ONE open PR / working branch at a time. NO EXCEPTIONS.** There is *never* more than
    one pull request open, and *never* more than one feature branch in flight, at any single moment.
    You MUST get the current PR **merged** (or close it) before you create the next branch or open the
    next PR — full stop. Do **not** stack PRs, do **not** parallelize branches, do **not** "get ahead"
    on the next task while a PR is open, **even if the next piece looks independent**. When the user
    asks for new work while a PR is still open, you have exactly two moves: (a) fold it into the open
    branch if it belongs there, or (b) say plainly that you are **blocked until the current PR merges**
    and wait. Opening a second PR "to save time" is a hard-rule violation, not a shortcut — it fragments
    review, tangles history, and makes rebases painful. One branch. One PR. Merge, then next.

---

## 1. Repository structure

```
mermollusc/
├── AGENTS.md / CLAUDE.md(symlink) / PLAN.md
├── Makefile          root fan-out (runs targets across modules in DAG order)
├── module.mk         shared make targets, included by every TS module
├── tsconfig.base.json / biome.json / pnpm-workspace.yaml (catalog = pinned versions)
├── tools/            guard-types.mjs (type-policy guard), new-module.mjs (generator)
├── modules/<m>/      self-contained TS module (see §2)
├── modules/relay/    the collaboration relay — Go, not TS: its own Makefile implements the same
│                       target names (§6) with Go bodies; no package.json/tsconfig; five doc files as usual
└── app/playground/   the web app wiring all modules together
```

Each module is **totally self-contained**: its own docs, Makefile, package.json, tsconfig,
source, and tests live under its directory. Cross-module coupling happens only through the
published package API and the dependency DAG (§4).

## 2. Module internal layout

```
modules/<m>/
├── PLAN.md  STATUS.md  WHAT_WE_DID.md  DO_NEXT.md  BUGS.md   (the five doc files)
├── Makefile          include ../../module.mk
├── package.json  tsconfig.json
├── src/
│   ├── core/         PURE. no IO, no logging, no throw. branded data -> Result. no any/unknown/as.
│   └── shell/        IMPERATIVE. IO, decoding, logging, library adapters.
└── test/{unit,integration,fixtures}/
```

The five doc files, by purpose:

| File | Holds |
|------|-------|
| `PLAN.md` | the module's design + roadmap |
| `STATUS.md` | one-glance current-state / health snapshot |
| `WHAT_WE_DID.md` | append-only work log |
| `DO_NEXT.md` | the next concrete actions |
| `BUGS.md` | known bugs with stable IDs |

## 3. Type policy & the two sanctioned boundaries

- Functional core: **zero** `any` / `unknown` / `as` / authored `undefined` / optional `?:` /
  string-or-number-keyed dicts, **and no raw `brand<…>`** (mint branded values through a smart
  constructor instead — see below). Enforced by Biome (`noExplicitAny`) plus `tools/guard-types.mjs`
  (TS compiler API), which also bans wildcard imports/exports and type/lint suppressions across
  `src`. `make lint` runs both.
- Exactly two unsafe operations exist, **only in `src/shell/`**, each a named, commented helper:
  - `brand<T, B>(value)` — the single sanctioned `as` cast, to mint a branded value. It is **shell-only**;
    cores never call it. Each branded type gets a **smart constructor** in some module's `src/shell`
    (validating where it can, e.g. `coordinate`/`length`; a plain typed wrapper where the value is an
    opaque handle, e.g. `sceneNodeId`/`sceneEdgeId` in `@m/contracts`). Cores import and call the
    constructor, so the `as` stays out of `src/core` (the guard rejects `brand<…>` there). New branded
    types follow the same pattern: add a constructor next to `brand`, don't cast in core.
  - `decode(schema, input)` — the I/O-boundary validator (Zod). Untyped external input
    (user text, icon JSON, the elkjs result surface) enters only through a decoder that
    returns branded types or a `Result` error. The core never sees raw input.

## 4. Dependency DAG (acyclic — enforced)

```
std <- contracts <- { parser, layout, renderer, icons } <- builder <- collab <- app
                                                     relay (Go) <- app (dev server / e2e webServer)
```

`std` depends on nothing. Importing "upward" (e.g. `std` importing `parser`) is forbidden.
`modules/relay` is Go and shares no code with the TS graph — the app couples to it only over the wire
protocol (`@m/collab`'s transport speaks to the native binary) and, for the backend-free demo, through
the compiled WASM artifact (`cmd/relay-wasm` driven by `@m/collab`'s `wasm-relay.ts`).

## 5. Functional core / imperative shell

The core is pure and total: it maps branded inputs to branded outputs or a `Result` error,
never performs IO, never logs, never throws. The shell does everything impure: canvas/DOM,
filesystem, the ELK worker, decoding, and logging. Tests target the core directly (cheap,
property-based) and the shell via integration tests.

The one sanctioned core throw is `assertNever` (in `@m/std`): a compile-time exhaustiveness guard
for closed unions. When every variant is handled its argument narrows to `never` and the call
type-checks; a new, unhandled variant becomes a compile error. Its runtime `throw` fires only if a
type-violating value reaches it despite the types (e.g. unchecked external input) — a loud failure,
consistent with fail-loud, not a fallback.

## 6. Uniform make targets (defined in `module.mk`, identical everywhere)

```
install build typecheck lint lint-fix fmt fmt-check
test test-unit test-int test-e2e test-watch cov
run stop clean doc-check
check    # typecheck + lint + fmt-check + test — the gate
```

Run any target at the root to fan out across modules in DAG order, or inside a module for
just that module. `run`/`stop` use the module's `RUN_CMD`/`STOP_CMD` (libs default `run` to
`test-watch`; the app overrides to its dev server; `stop` kills the pidfile).

## 7. Testing pyramid (per module)

- **Unit** (most numerous): pure `core/` functions, property-based with `fast-check`.
- **Integration**: `shell` + `core` wired against fixtures.
- **E2E / golden** (fewest, in `app`): text → pixels and text → edit → text snapshots.
- `make cov` reports coverage and **enforces per-module thresholds** (exits non-zero on a miss).
  Each library module has a `vitest.config.ts` built from `tools/vitest.shared.mjs` (`all: true`
  over `src/**`, barrels excluded) with a threshold ratchet set just below current coverage; raise
  the ratchet as coverage climbs. `contracts` (types-only) and `app` (covered by Playwright e2e,
  not vitest) carry no thresholds.
- **Tests are typechecked.** Each module's `tsconfig.json` includes `test/` (the app also `e2e/`),
  so `make typecheck` catches fixture/mock drift under the same strict config as `src` — not just
  the editor. Note: Biome lint and the type-guard still scope to `src/` (the core rules are a
  source-code contract); the strict compiler is what guards the tests.

## 8. Logging

Structured JSON lines from the `Logger` contract in `@m/std`: `{ ts, level, module, event, data }`.
The **core never logs** (it returns `Result`); the shell logs loudly at boundaries. `event` is a
closed union per module — never a free-form string.

## 9. Pre-commit pipeline

`.pre-commit-config.yaml` drives the `pre-commit` framework; `make hooks` installs it. Two stages:

- **pre-commit** (fast, every commit): `make branch-guard` (enforces §0.11 — one working branch, `main`
  in sync with origin; runs first so it fails fast), whitespace/EOF/yaml/json/large-file hygiene,
  **gitleaks** secret scan, `make fmt-check`, `make lint` (biome + type guard), `make typecheck`,
  `make test` (unit + integration).
- **pre-push** (heavier): `make sast` (**semgrep**, strict, run via `uvx`), `make e2e-ui`
  (**Playwright**, one spec per UI flow), `make e2e-pages` (built GitHub Pages demo e2e),
  `make e2e-api` (HTTP API e2e — a placeholder until an API module exists; never fabricate tests
  against a non-existent API).

The `Branch guard` GitHub Actions workflow (`.github/workflows/branch-guard.yml`) runs `make
branch-guard-remote` on every PR and push to main: it fails if origin has more than one non-`main`
branch, so a second concurrent PR/branch turns the checks red until it's merged or closed. Both the
local hook and the CI job call `tools/branch-guard.sh`.

Hook repo revs are pinned in the config; semgrep is pinned in the `Makefile`, Playwright in the
catalog. All were chosen with the ≥24h supply-chain rule (§0.3).
