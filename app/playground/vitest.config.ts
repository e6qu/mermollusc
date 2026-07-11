import { defineConfig } from "vitest/config";

// The app's integration tests drive the full parse→layout(ELK)→display pipeline over every catalog
// example; under v8 coverage instrumentation (`make cov`) a single dense example (e.g. cloud) can take
// several seconds, and on a loaded machine the default 5s per-test timeout flakes the coverage gate.
// Raise it — the app carries no coverage thresholds (AGENTS §7: it's covered by Playwright e2e), so
// this only affects test timeouts, not what's enforced.
export default defineConfig({
  test: {
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
