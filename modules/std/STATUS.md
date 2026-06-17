# @m/std — status

**State:** core + shell implemented; `make check` green.

- core: `Result` + combinators (`map`/`mapErr`/`flatMap`/`unwrapOr`/`match`/`all`/`tap`), `Brand`,
  geometry split by role — `Coordinate` (signed position) vs `Length` (non-negative extent) —
  (`Point`/`Size`/`Rect` + `rectContains`), generic `Logger` contract.
- shell: `brand()` (sole `as` cast), `decode()` (Zod boundary), `coordinate()`/`length()` (the latter
  validates ≥0, failing loud) + `point`/`size`/`rect`, `consoleLogger`, `stamp()` (ISO `ts`).
- tests: 26 unit passing — example-based (Result, rectContains), **property-based** (fast-check:
  functor/monad laws for `Result`, `mapErr`, `unwrapOr` totality, `match` round-trip, `all`
  short-circuit, `tap` effect-on-ok, `rectContains` invariants), and **shell** tests (`consoleLogger`
  routing + JSON, `decode` ok/err, branded constructors, `length` rejects negatives, `stamp`).
- coverage ratchet (`vitest.config.ts`): 100% across statements/branches/functions/lines.
- consumed via its source entry (`src/index.ts`); tsup build is publish-only, off the dev path.
