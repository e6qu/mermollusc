import { defineConfig } from "vitest/config";

// Shared coverage setup for the library modules. Each module supplies its own thresholds (a ratchet
// just below its current coverage) so `make cov` fails on regression. `all: true` counts every
// source file, not just the ones a test happened to import; barrels are pure re-exports, so they're
// excluded to avoid diluting the numbers.
export const moduleCoverage = (thresholds) =>
  defineConfig({
    test: {
      coverage: {
        provider: "v8",
        all: true,
        include: ["src/**"],
        exclude: ["src/**/index.ts"],
        thresholds,
      },
    },
  });
