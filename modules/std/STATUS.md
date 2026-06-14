# @m/std — status

**State:** core + shell implemented; `make check` green.

- core: `Result` + combinators, `Brand`, geometry (`Px`/`Point`/`Size`/`Rect` + `rectContains`), `Logger` contract.
- shell: `brand()` (sole `as` cast), `decode()` (Zod boundary), `consoleLogger`.
- tests: 5 unit tests passing (Result, rectContains).
- build: not yet run via tsup.
