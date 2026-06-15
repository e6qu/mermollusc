# @m/std — status

**State:** core + shell implemented; `make check` green.

- core: `Result` + combinators, `Brand`, geometry (`Px`/`Point`/`Size`/`Rect` + `rectContains`), generic `Logger` contract.
- shell: `brand()` (sole `as` cast), `decode()` (Zod boundary), `consoleLogger`.
- tests: 14 unit passing — example-based (Result, rectContains) plus **property-based** (fast-check):
  functor/monad laws for `Result`, `unwrapOr` totality, `rectContains` corner/edge invariants.
- consumed via its source entry (`src/index.ts`); tsup build is publish-only, off the dev path.
