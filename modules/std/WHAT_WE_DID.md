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
