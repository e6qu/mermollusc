# @m/std — work log

- Scaffolded module skeleton: dirs, five doc files, config, core/shell stubs.
- Implemented core: `Result`/`Ok`/`Err` with `ok`/`err`/`isOk`/`isErr`/`map`/`mapErr`/`flatMap`/`unwrapOr`;
  `Brand`; geometry types + `rectContains`; `Logger`/`LogRecord`/`LogLevel` contract.
- Implemented shell boundaries: `brand()` + branded constructors (`px`/`point`/`size`/`rect`),
  `decode()` over Zod, `consoleLogger` (warn/error → stderr).
- Added unit tests for `Result` and `rectContains` (5 passing).
- Added the first property-based tests (fast-check, per the testing pyramid in AGENTS §7):
  `Result` functor/monad laws, `unwrapOr` totality, `rectContains` corner/edge invariants. +9 tests.
- Added shell tests (`consoleLogger` warn/error→stderr + info/debug→stdout as JSON; `decode` ok/err
  paths; `px`/`point`/`size`/`rect` shapes) and a `mapErr` property, lifting coverage ~64%→**100%**
  and raising the ratchet to 100. +7 tests.
- Added `stamp(level, module, event)` shell helper — fills a `LogRecord`'s `ts` (ISO-8601) so callers
  don't hand-roll it. +1 test.
- Completed the `Result` monad with `match` (total fold of both branches), `all`
  (`Result[]` → first-err-or-all-values), and `tap` (run an effect on ok, pass through). Property
  tests: match round-trips via `match(r, ok, err)`, all short-circuits on first err, tap fires only
  on ok. +3 tests (25 total).
- Split geometry by role (refinement typing): `Px` → `Coordinate` (signed position) and `Length`
  (non-negative extent). `length()` validates `n >= 0` and fails loud (`RangeError`) on a negative,
  so an inverted box surfaces at its source; `coordinate()` is unrestricted. `Point` uses
  `Coordinate`, `Size` uses `Length`. A negative-size value is now unconstructible. +1 test (length
  rejects negatives); shell `px` test reworked to coordinate/length (26 total).
- Type-system hardening: added `assertNever(x: never)` (`core/exhaustive.ts`) — the compile-time
  exhaustiveness guard for closed unions, so a new diagram family / shape / draw-command can't be
  silently misrouted by a `default:`/fall-through (it becomes a type error at every dispatch).
  Enriched the Result monad with `andThen` (the conventional name for `flatMap`) and `traverse`
  (the fallible `map`: collect oks, short-circuit the first err — replaces hand-rolled push/early-return
  loops). Strengthened `length()` to reject **non-finite** values: the old `n < 0` guard let
  `length(NaN)` through (NaN compares false to everything), so a NaN could be branded as a Length;
  now `!(n >= 0) || !Number.isFinite(n)` fails loud. +tests (andThen, traverse incl. empty/index/err,
  assertNever throws, length rejects NaN/Infinity).
- Refined-number brands: added `Positive` (finite `> 0`) and `PositiveInt` (finite integer `≥ 1`) with
  validating shell constructors `positive`/`positiveInt` — the same "push the invariant into the type"
  pattern as `Length`, so a zero/negative/NaN slice value or a zero/fractional column count is
  unconstructible. +tests (accept valid, reject zero/negative/fraction/NaN/Infinity).
- Added `TwoOrMore<T>` (`readonly [T, T, ...T[]]`) + the `twoOrMore(first, second, ...rest)` constructor
  — a list with ≥2 elements where `[0]`/`[1]` are total, so a too-short edge route is unrepresentable.
  The constructor needs no assertion (the tuple-rest literal types itself), and the type is structurally
  a `readonly T[]`, so existing readers are unaffected. +test (order kept, `[0]`/`[1]` present).
