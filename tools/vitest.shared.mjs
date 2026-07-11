import { defineConfig } from "vitest/config";

// Shared coverage setup for the library modules. Each module supplies its own thresholds (a ratchet
// just below its current coverage) so `make cov` fails on regression. `all: true` counts every
// source file, not just the ones a test happened to import; barrels are pure re-exports, so they're
// excluded to avoid diluting the numbers.
export const moduleCoverage = (thresholds) =>
  defineConfig({
    test: {
      // v8 coverage instrumentation (`make cov`) runs several times slower than a bare `make test`, and
      // a property test (fast-check `numRuns` in the hundreds) or an ELK-driven integration test is one
      // vitest test under one timeout — under coverage on a loaded CI runner it can exceed the 5s default
      // and flake the gate with no code change. Give every module the same headroom the app already has.
      testTimeout: 20_000,
      hookTimeout: 20_000,
      coverage: {
        provider: "v8",
        all: true,
        include: ["src/**"],
        exclude: ["src/**/index.ts"],
        thresholds,
      },
    },
  });
