# @m/std — status

**State:** core + shell implemented; `make check` green.

- core: `Result` + combinators, `Brand`, geometry (`Px`/`Point`/`Size`/`Rect` + `rectContains`), generic `Logger` contract.
- shell: `brand()` (sole `as` cast), `decode()` (Zod boundary), `consoleLogger`, `stamp()` (ISO `ts`).
- tests: 22 unit passing — example-based (Result, rectContains), **property-based** (fast-check:
  functor/monad laws for `Result`, `mapErr`, `unwrapOr` totality, `rectContains` invariants), and
  **shell** tests (`consoleLogger` routing + JSON, `decode` ok/err, branded constructors, `stamp`).
- coverage ratchet (`vitest.config.ts`): 100% across statements/branches/functions/lines.
- consumed via its source entry (`src/index.ts`); tsup build is publish-only, off the dev path.
