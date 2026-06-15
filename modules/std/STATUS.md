# @m/std — status

**State:** core + shell implemented; `make check` green.

- core: `Result` + combinators, `Brand`, geometry (`Px`/`Point`/`Size`/`Rect` + `rectContains`), generic `Logger` contract.
- shell: `brand()` (sole `as` cast), `decode()` (Zod boundary), `consoleLogger`.
- tests: 5 unit tests passing (Result, rectContains).
- consumed via its source entry (`src/index.ts`); tsup build is publish-only, off the dev path.
